import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Calendar, Sparkles, List, Lock, Unlock } from 'lucide-react';
// Using native HTML5 drag-and-drop instead of @hello-pangea/dnd for React Native Web compatibility
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import DraggableEvent from './DraggableEvent';
// Re-enabling step by step
import EventModal from '../events/EventModal';
import RescheduleReportModal from './RescheduleReportModal';
import BlackoutDialog from './BlackoutDialog';
import RescheduleModal from './RescheduleModal';
import { proposeReschedule, getWeekStart, rescheduleEvent, freezeWeek } from '../../lib/apiClient';
import PlanYearWizard from '../year/PlanYearWizard';

// Helper functions
function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDow(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

// Get YYYY-MM-DD date string in local timezone (not UTC)
function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesSinceMidnight(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') {
    console.warn('Invalid time format:', hhmm);
    return 0; // Default to midnight
  }
  const parts = hhmm.split(':');
  if (parts.length < 2) {
    console.warn('Invalid time format (missing colon):', hhmm);
    return 0;
  }
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) {
    console.warn('Invalid time format (non-numeric):', hhmm);
    return 0;
  }
  return h * 60 + m;
}

// Custom hook for week data
function useWeekData(weekStart, childIds, familyId) {
  const [data, setData] = useState({ children: [], avail: [], events: [] });
  const [loading, setLoading] = useState(false);
  const prevWeekStartRef = useRef(weekStart.toISOString());

  useEffect(() => {
    let active = true;
    (async () => {
      if (!familyId) return;
      
      // Only show loading when week changes, not when filter changes
      const weekChanged = prevWeekStartRef.current !== weekStart.toISOString();
      const hasNoData = !data.children || data.children.length === 0;
      const shouldShowLoading = weekChanged || hasNoData;
      
      if (shouldShowLoading) {
        setLoading(true);
      }
      
      // Update the ref for next comparison
      prevWeekStartRef.current = weekStart.toISOString();
      
      // Use local date strings for RPC call (backend will handle timezone conversion)
      const from = getLocalDateString(weekStart);
      const to = getLocalDateString(addDays(weekStart, 7));
      
      const { data: res, error } = await supabase.rpc('get_week_view', {
        _family_id: familyId,
        _from: from,
        _to: to,
        _child_ids: childIds && childIds.length > 0 ? childIds : null
      });

      if (error) {
        console.error('get_week_view error', error);
        if (shouldShowLoading) {
          setLoading(false);
        }
        return;
      }
      if (!active) return;
      
      // Debug: Log the raw RPC response to check avatar field
      if (typeof window !== 'undefined' && window.console && process.env.NODE_ENV === 'development') {
        console.log('RPC response children:', res?.children?.map(c => ({ id: c.id, name: c.name, avatar: c.avatar })));
      }
      
      // Always write a new object when updating state (spread to guarantee new refs)
      setData({
        children: res?.children ? [...res.children] : [],
        avail: res?.avail ? [...res.avail] : [],
        events: res?.events ? [...res.events] : []
      });
      if (shouldShowLoading) {
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [weekStart.toISOString(), JSON.stringify(childIds || []), familyId]);
  
  return { data, loading };
}

// Day Column Component
function DayColumn({ date, dateIso, hours, windows, events, onAdd, onEventChanged, onEventClick, dayStatus, children = [], focusedChildId = null, draggedEventId = null, onMouseDragStart = null }) {
  const total = hours.endMin - hours.startMin;
  const step = hours.step;
  const isBlackout = dayStatus === 'off' || (windows.length === 0 && dayStatus === 'off');
  const isPartialBlackout = dayStatus === 'partial'; // Some children off, some available

  // Sort events by start time for proper drag-drop ordering
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aStart = new Date(a.start_ts).getTime();
      const bStart = new Date(b.start_ts).getTime();
      return aStart - bStart;
    });
  }, [events]);

  // Use div for web
  const ColumnWrapper = typeof window !== 'undefined' ? 'div' : View;
  
  return (
    <ColumnWrapper 
      data-day-date={dateIso || getLocalDateString(date)}
      style={[
        styles.dayColumn,
        isBlackout && styles.dayColumnBlackout,
        isPartialBlackout && styles.dayColumnPartialBlackout
      ]}
    >
            {/* Hour lines */}
            {Array.from({ length: Math.floor(total / step) + 1 }).map((_, i) => {
              const y = (i * step / total) * 100;
              const LineWrapper = typeof window !== 'undefined' ? 'div' : View;
              return (
                <LineWrapper
                  key={i}
                  style={[styles.hourLine, { top: `${y}%` }]}
                />
              );
            })}

            {/* Availability windows - only show if not full blackout */}
            {!isBlackout && windows
              .filter(w => w && w.start && w.end) // Filter out invalid windows
              .map((w, idx) => {
                const s = ((minutesSinceMidnight(w.start) - hours.startMin) / total) * 100;
                const e = ((minutesSinceMidnight(w.end) - hours.startMin) / total) * 100;
                const h = Math.max(2, e - s);
                const WindowWrapper = typeof window !== 'undefined' ? 'div' : View;
                return (
                  <WindowWrapper
                    key={idx}
                    style={[
                      styles.availWindow,
                      { top: `${s}%`, height: `${h}%` }
                    ]}
                  />
                );
              })}
            
            {/* Blackout indicator overlay - full blackout */}
            {isBlackout && (() => {
              const OverlayWrapper = typeof window !== 'undefined' ? 'div' : View;
              const TextWrapper = typeof window !== 'undefined' ? 'span' : Text;
              return (
                <OverlayWrapper style={styles.blackoutOverlay}>
                  <TextWrapper style={styles.blackoutText}>No Availability</TextWrapper>
                </OverlayWrapper>
              );
            })()}
            
            {/* Partial blackout indicator - some children off */}
            {isPartialBlackout && (() => {
              const OverlayWrapper = typeof window !== 'undefined' ? 'div' : View;
              const TextWrapper = typeof window !== 'undefined' ? 'span' : Text;
              return (
                <OverlayWrapper style={styles.partialBlackoutOverlay}>
                  <TextWrapper style={styles.partialBlackoutText}>Partial Availability</TextWrapper>
                </OverlayWrapper>
              );
            })()}

          {/* Events - Now Draggable with native HTML5 */}
          {sortedEvents
            .filter(ev => {
              // Filter events to only show those within or overlapping the visible time range
              const eventDate = new Date(ev.start_ts);
              const eventStartMin = eventDate.getHours() * 60 + eventDate.getMinutes();
              const eventEndDate = new Date(ev.end_ts);
              const eventEndMin = eventEndDate.getHours() * 60 + eventEndDate.getMinutes();
              
              // Show event if it overlaps with visible range (start before endMin, end after startMin)
              return eventStartMin < hours.endMin && eventEndMin > hours.startMin;
            })
            .map((ev, index) => {
              // Calculate event position
              const eventDate = new Date(ev.start_ts);
              let sMin;
              if (ev.start_local) {
                const [hours, minutes] = ev.start_local.split(':').map(Number);
                sMin = hours * 60 + minutes;
              } else {
                const localHours = eventDate.getHours();
                const localMinutes = eventDate.getMinutes();
                sMin = localHours * 60 + localMinutes;
              }
              
              const top = ((sMin - hours.startMin) / total) * 100;
              const durMin = Math.max(5, Math.round((new Date(ev.end_ts).getTime() - eventDate.getTime()) / 60000));
              const heightPercent = (durMin / total) * 100;
              const isDragging = draggedEventId === ev.id;
              const canDrag = !isBlackout && ev.status !== 'done';
              
              // Use mouse-based drag-and-drop (works better with React Native Web)
              if (typeof window !== 'undefined') {
                // Web - use div with mouse drag handlers
                return (
                  <div
                    key={ev.id}
                    onMouseDown={(e) => {
                      if (canDrag && onMouseDragStart) {
                        console.log('[DayColumn] MouseDown on draggable event:', ev.id);
                        onMouseDragStart(e, ev.id);
                      }
                    }}
                    onClick={(e) => {
                      // Only handle click if not dragging
                      if (!isDragging) {
                        e.stopPropagation();
                        if (onEventClick) {
                          onEventClick(ev);
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: 4,
                      right: 4,
                      top: `${Math.max(0, top)}%`,
                      height: `${heightPercent}%`,
                      zIndex: isDragging ? 1000 : 10,
                      cursor: canDrag ? 'grab' : 'default',
                      opacity: isDragging ? 0.5 : 1,
                      touchAction: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      transform: isDragging ? 'scale(1.05)' : 'scale(1)',
                      transition: isDragging ? 'none' : 'opacity 0.2s, transform 0.2s',
                    }}
                  >
                    <DraggableEvent
                      ev={ev}
                      dayStartMin={hours.startMin}
                      dayEndMin={hours.endMin}
                      totalMin={total}
                      isBlackoutDay={isBlackout}
                      onChanged={(patched) => onEventChanged(ev.id, patched)}
                      onClick={onEventClick}
                      children={children}
                      focusedChildId={focusedChildId}
                      isWrapped={true}
                    />
                  </div>
                );
              }
              
              // React Native - use View (no drag on native)
              return (
                <View
                  key={ev.id}
                  style={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    top: `${Math.max(0, top)}%`,
                    height: `${heightPercent}%`,
                    zIndex: 10,
                  }}
                >
                  <DraggableEvent
                    ev={ev}
                    dayStartMin={hours.startMin}
                    dayEndMin={hours.endMin}
                    totalMin={total}
                    isBlackoutDay={isBlackout}
                    onChanged={(patched) => onEventChanged(ev.id, patched)}
                    onClick={onEventClick}
                    children={children}
                    focusedChildId={focusedChildId}
                    isWrapped={true}
                  />
                </View>
              );
            })}

          {/* Click to add overlay - only captures clicks on empty space */}
          {typeof window === 'undefined' ? (
            <TouchableOpacity
              style={styles.addOverlay}
              onPress={(e) => {
                // Check if the click target is an event (not empty space)
                // Events have z-index 10, so if we clicked on one, don't add
                if (typeof window !== 'undefined' && e.nativeEvent) {
                  const target = e.nativeEvent.target;
                  // Check if the clicked element or its parent is an event
                  if (target && (target.closest('[data-event-id]') || target.style?.zIndex === '10')) {
                    return; // Don't add, let the event handle the click
                  }
                }
                
                // Only add if clicking on empty space (not on an event)
                if (events.length > 0) {
                  const startMin = Math.round(hours.startMin + 9 * 60); // Default to 9 AM
                  onAdd(startMin);
                }
              }}
              activeOpacity={1}
            />
          ) : (
            <div
              style={styles.addOverlay}
              onClick={(e) => {
                // Check if the click target is an event (not empty space)
                const target = e.target;
                if (target && (target.closest('[data-event-id]') || target.closest('[data-rbd-draggable-id]'))) {
                  return; // Don't add, let the event handle the click
                }
                
                // Only add if clicking on empty space (not on an event)
                if (events.length > 0) {
                  const startMin = Math.round(hours.startMin + 9 * 60); // Default to 9 AM
                  onAdd(startMin);
                }
              }}
            />
          )}
        </ColumnWrapper>
      )}
    </Droppable>
  );
}

export default function PlannerWeek({ familyId, onAddActivity, onOpenAIPlanner, selectedChildIds, onChildFilterChange, onViewChange, weekStart: propWeekStart, onWeekStartChange, onEventSelect }) {
  const [weekStart, setWeekStart] = useState(() => propWeekStart || startOfWeek(new Date()));
  
  // Sync with prop if provided
  useEffect(() => {
    if (propWeekStart) {
      setWeekStart(propWeekStart);
    }
  }, [propWeekStart]);
  
  // Notify parent of changes
  const handleWeekStartChange = useCallback((newWeekStart) => {
    setWeekStart(newWeekStart);
    if (onWeekStartChange) {
      onWeekStartChange(newWeekStart);
    }
  }, [onWeekStartChange]);
  const [localEvents, setLocalEvents] = useState({}); // Optimistic updates
  const [currentPeriod, setCurrentPeriod] = useState('this-week');
  const [rescheduleReport, setRescheduleReport] = useState(null);
  const [allChildren, setAllChildren] = useState([]); // Complete list for filter UI
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showBlackoutDialog, setShowBlackoutDialog] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [reschedulePlan, setReschedulePlan] = useState(null);
  const [hasBlackout, setHasBlackout] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [loadingReschedule, setLoadingReschedule] = useState(false);
  const [hasScrolledTo7AM, setHasScrolledTo7AM] = useState(false);
  const [focusedChildId, setFocusedChildId] = useState(null); // For focus mode
  const [showYearWizard, setShowYearWizard] = useState(false);
  const initialScrollOffset = { x: 0, y: 420 }; // Start at 7 AM (7 hours * 60px)
  const [draggedEventId, setDraggedEventId] = useState(null); // Track which event is being dragged
  const [dragState, setDragState] = useState(null); // { eventId, startX, startY, currentX, currentY }
  const dragRef = useRef(null); // Ref to track drag element
  const [isWeekFrozen, setIsWeekFrozen] = useState(false); // Track if current week is frozen
  const [freezeLoading, setFreezeLoading] = useState(false); // Loading state for freeze toggle
  
  const { data, loading } = useWeekData(weekStart, selectedChildIds, familyId);

  // Memoize formatted month/year to prevent unnecessary recalculations
  const monthYearText = useMemo(() => {
    return weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [weekStart.getFullYear(), weekStart.getMonth()]);

  // Fetch complete list of children for filter UI (not filtered)
  useEffect(() => {
    if (!familyId) return;
    (async () => {
      const { data: childrenData } = await supabase
        .from('children')
        .select('id, first_name')
        .eq('family_id', familyId)
        .eq('archived', false);
      
      if (childrenData) {
        setAllChildren(childrenData.map(c => ({ id: c.id, name: c.first_name })));
      }
    })();
  }, [familyId]);

  // Handle event updates (optimistic + refetch on error)
  const handleEventChanged = (eventId, patched) => {
    if (patched === null) {
      // Error occurred, refetch
          setLocalEvents({});
          // Trigger refetch by updating weekStart slightly
          handleWeekStartChange(new Date(weekStart));
    } else {
      // Optimistic update
      setLocalEvents(prev => ({ ...prev, [eventId]: patched }));
    }
  };

  // Handle drag end - reschedule event to new day/time
  const handleDragEnd = useCallback(async (result) => {
    console.log('[PlannerWeek] handleDragEnd called:', result);
    const { destination, source, draggableId } = result;
    
    // If no destination, do nothing (drag cancelled)
    if (!destination) {
      console.log('[PlannerWeek] Drag cancelled - no destination');
      setDraggedEventId(null);
      return;
    }
    
    // If dropped in same position, do nothing
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      setDraggedEventId(null);
      return;
    }
    
    // Find the event being dragged
    const eventId = draggableId;
    const allEvents = filtEvents;
    const event = allEvents.find(e => e.id === eventId);
    
    if (!event) {
      console.error('Event not found for drag:', eventId);
      setDraggedEventId(null);
      return;
    }
    
    // Get original event times
    const originalStart = new Date(event.start_ts);
    const originalEnd = new Date(event.end_ts);
    const durationMs = originalEnd.getTime() - originalStart.getTime();
    
    // Parse destination date (droppableId is ISO date string)
    const destDate = new Date(destination.droppableId);
    if (isNaN(destDate.getTime())) {
      console.error('Invalid destination date:', destination.droppableId);
      setDraggedEventId(null);
      return;
    }
    
    // Compute new start time: copy time portion from original, replace date
    const newStart = new Date(destDate);
    newStart.setHours(originalStart.getHours());
    newStart.setMinutes(originalStart.getMinutes());
    newStart.setSeconds(originalStart.getSeconds());
    newStart.setMilliseconds(originalStart.getMilliseconds());
    
    // Compute new end time: add original duration
    const newEnd = new Date(newStart.getTime() + durationMs);
    
    // Optimistic update: update local state immediately
    const optimisticEvent = {
      ...event,
      start_ts: newStart.toISOString(),
      end_ts: newEnd.toISOString(),
      date_local: getLocalDateString(newStart),
    };
    setLocalEvents(prev => ({ ...prev, [eventId]: optimisticEvent }));
    setDraggedEventId(null);
    
    // Call API to reschedule
    try {
      const { data: updatedEvent, error } = await rescheduleEvent(
        eventId,
        newStart.toISOString(),
        newEnd.toISOString(),
        'drag_drop',
        'manual move'
      );
      
      if (error) {
        // Revert optimistic update on error
        console.error('Reschedule error:', error);
        setLocalEvents(prev => {
          const next = { ...prev };
          delete next[eventId]; // Remove optimistic update
          return next;
        });
        // Show error toast
        Alert.alert('Error', `Failed to reschedule event: ${error.message || 'Unknown error'}`);
        // Trigger refetch
        handleWeekStartChange(new Date(weekStart));
      } else {
        // Success - update local state with server response
        if (updatedEvent) {
          setLocalEvents(prev => ({ ...prev, [eventId]: updatedEvent }));
        }
      }
    } catch (err) {
      // Revert optimistic update on exception
      console.error('Reschedule exception:', err);
      setLocalEvents(prev => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      Alert.alert('Error', `Failed to reschedule event: ${err.message || 'Unknown error'}`);
      handleWeekStartChange(new Date(weekStart));
    }
  }, [filtEvents, weekStart, handleWeekStartChange]);

  const handlePeriodChange = (period, dates) => {
    setCurrentPeriod(period);
    // Convert Luxon DateTime to JS Date
    const startDate = dates.start.toJSDate ? dates.start.toJSDate() : new Date(dates.start);
    handleWeekStartChange(startDate);
  };

  const handlePackThisWeek = async () => {
    // TODO: Implement AI packing logic
    alert('Pack This Week - AI endpoint coming soon!');
  };

  const handleRebalance4Weeks = async () => {
    if (!familyId || !selectedChildIds || selectedChildIds.length === 0) {
      Alert.alert('Error', 'Please select at least one child');
      return;
    }

    setLoadingReschedule(true);
    try {
      const weekStartDate = getWeekStart(weekStart);
      const { data, error } = await proposeReschedule({
        familyId,
        weekStart: weekStartDate,
        childIds: selectedChildIds,
        horizonWeeks: 2,
        reason: 'rebalance',
      });

      if (error) throw error;

      // Use persisted changes from backend if available, otherwise transform proposal
      const changes = data.changes && data.changes.length > 0
        ? data.changes  // Backend returns persisted changes with database IDs
        : (() => {
            // Fallback: transform proposal structure (shouldn't happen, but handle gracefully)
            const proposal = data.proposal || {};
            return [
              ...(proposal.adds || []).map((add, idx) => ({
                id: `add-${idx}-${Date.now()}`,
                change_type: 'add',
                event_id: null,
                payload: add,
              })),
              ...(proposal.moves || []).map((move, idx) => ({
                id: `move-${idx}-${Date.now()}`,
                change_type: 'move',
                event_id: move.event_id,
                payload: move,
              })),
              ...(proposal.deletes || []).map((del, idx) => ({
                id: `delete-${idx}-${Date.now()}`,
                change_type: 'delete',
                event_id: del.event_id,
                payload: del,
              })),
            ];
          })();
      setReschedulePlan({
        ...data,
        changes,
      });
      setShowRescheduleModal(true);
    } catch (err) {
      console.error('Error proposing reschedule:', err);
      Alert.alert('Error', err.message || 'Failed to propose reschedule');
    } finally {
      setLoadingReschedule(false);
    }
  };

  // Check for blackouts in the current week
  useEffect(() => {
    if (!familyId) return;

    const checkBlackouts = async () => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      let query = supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .lte('starts_on', weekEnd.toISOString().split('T')[0])
        .gte('ends_on', weekStart.toISOString().split('T')[0]);

      // Filter by child_id if specific children are selected
      if (selectedChildIds && selectedChildIds.length > 0) {
        // Include family-wide blackouts (child_id is null) OR child-specific blackouts
        query = query.or(`child_id.is.null,child_id.in.(${selectedChildIds.join(',')})`);
      } else {
        // When no children selected, only show family-wide blackouts
        query = query.is('child_id', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error checking blackouts:', error);
        return;
      }

      setHasBlackout((data?.length || 0) > 0);
    };

    checkBlackouts();
  }, [familyId, weekStart, selectedChildIds]);

  const handleWhatIf = async () => {
    // TODO: Implement what-if modal
    alert('What-if Analysis - Coming soon!');
  };

  const handlePlanYear = () => {
    setShowYearWizard(true);
  };

  const handleEventClick = (event) => {
    // If onEventSelect is provided, use it (for showing in right pane like month view)
    // Otherwise, fall back to opening the modal
    if (onEventSelect) {
      // Include children data from week view if available
      const eventWithChildren = {
        ...event,
        children: data.children || []
      };
      onEventSelect(eventWithChildren);
    } else {
      setSelectedEventId(event.id);
      setShowEventModal(true);
    }
  };

  const handleEventRightClick = (event, nativeEvent) => {
    console.log('[PlannerWeek] handleEventRightClick called with event:', event?.title, 'nativeEvent:', nativeEvent);
    // Use the same handler from WebContent if available
    // For now, we'll create a simple context menu
    if (typeof window !== 'undefined' && nativeEvent) {
      // Prevent default if it's a native event, otherwise it's already prevented
      if (nativeEvent.preventDefault) {
        nativeEvent.preventDefault();
      }
      
      // Get position from event (handle both native and synthetic events)
      // For React Native Web, the event might be the synthetic event itself
      const clientX = nativeEvent.clientX || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientX) || (typeof window !== 'undefined' && window.event && window.event.clientX) || 0;
      const clientY = nativeEvent.clientY || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientY) || (typeof window !== 'undefined' && window.event && window.event.clientY) || 0;
      
      console.log('[PlannerWeek] Context menu position:', clientX, clientY);
      
      // Create context menu directly in DOM (same pattern as WebContent)
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }
      
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${clientY}px;
        left: ${clientX}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      const menuItems = [];
      
      menuItems.push({ text: 'Edit Event', action: () => handleEventClick(event) });
      
      // Add rebalance option if event has year_plan_id
      if (event.year_plan_id) {
        menuItems.push({ 
          text: 'Rebalance subject from here...', 
          action: () => {
            // Dispatch custom event to open rebalance modal
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openRebalanceModal', {
                detail: { event, yearPlanId: event.year_plan_id }
              }));
            }
          }
        });
      }
      
      menuItems.push({ text: 'Delete Event', action: () => {
        if (window.confirm('Are you sure you want to delete this event?')) {
          // TODO: Implement delete
          console.log('Delete event:', event.id);
        }
      }, isDelete: true });
      
      menuItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 16px 24px;
          color: ${item.isDelete ? '#dc2626' : '#374151'};
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
        `;
        
        div.addEventListener('mouseenter', () => {
          div.style.backgroundColor = item.isDelete ? '#fef2f2' : '#f8fafc';
        });
        
        div.addEventListener('mouseleave', () => {
          div.style.backgroundColor = 'transparent';
        });
        
        div.textContent = item.text;
        div.addEventListener('click', () => {
          item.action();
          menu.remove();
        });
        menu.appendChild(div);
      });
      
      document.body.appendChild(menu);
      
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }
  };

  const handleEventUpdated = () => {
    // Refetch week data
    setLocalEvents({});
    handleWeekStartChange(new Date(weekStart));
  };

  const handleEventDeleted = () => {
    // Refetch week data
    setLocalEvents({});
    handleWeekStartChange(new Date(weekStart));
  };
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  // Full 24-hour day: 12 AM (00:00) to 12 AM (24:00 = next day 00:00)
  const hours = { startMin: 0, endMin: 24 * 60, step: 60 };
  
  // Ref for ScrollView to auto-scroll to current time
  const scrollViewRef = useRef(null);
  
  // Function to scroll to 7 AM - defined before useEffects that use it
  const scrollTo7AM = useCallback(() => {
    if (hasScrolledTo7AM || !scrollViewRef.current) return;
    
    if (typeof window !== 'undefined') {
      // Simple approach: find the 7 AM label and use scrollIntoView
      const attemptScroll = () => {
        const label = document.querySelector('[data-time-label="7:00 AM"]') ||
                     Array.from(document.querySelectorAll('*')).find(el => {
                       const text = (el.textContent || '').trim();
                       return (text === '7:00 AM' || text === '7 AM') && 
                              el.getBoundingClientRect().width > 0;
                     });
        
        if (label && label.scrollIntoView) {
          label.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
          setHasScrolledTo7AM(true);
          return true;
        } else {
          // Fallback: use scrollTo with calculated position
          const scrollElement = scrollViewRef.current;
          if (scrollElement?.scrollTo) {
            scrollElement.scrollTo({ y: 420, animated: false });
            setHasScrolledTo7AM(true);
            return true;
          }
        }
        return false;
      };
      
      // Try immediately, then retry with requestAnimationFrame if needed
      if (!attemptScroll()) {
        requestAnimationFrame(() => {
          if (!attemptScroll()) {
            setTimeout(() => attemptScroll(), 50);
          }
        });
      }
    } else {
      // Non-web: use React Native method
      const scrollElement = scrollViewRef.current;
      if (scrollElement?.scrollTo) {
        scrollElement.scrollTo({ y: 420, animated: false });
        setHasScrolledTo7AM(true);
      }
    }
  }, [hasScrolledTo7AM]);
  
  // Trigger scroll when data loads
  useEffect(() => {
    if (!loading && !hasScrolledTo7AM) {
      scrollTo7AM();
    }
  }, [loading, hasScrolledTo7AM, scrollTo7AM]);
  
  // Reset scroll flag when week changes
  useEffect(() => {
    setHasScrolledTo7AM(false);
  }, [weekStart]);

  // Check if current week is frozen
  useEffect(() => {
    const checkFrozenStatus = async () => {
      if (!familyId || !weekStart) return;
      
      try {
        const weekStartDate = getLocalDateString(getWeekStart(weekStart));
        const weekEndDate = getLocalDateString(addDays(getWeekStart(weekStart), 6));
        
        // Query calendar_days_cache for frozen days in this week
        const { data: frozenDays, error } = await supabase
          .from('calendar_days_cache')
          .select('is_frozen')
          .eq('family_id', familyId)
          .gte('date', weekStartDate)
          .lte('date', weekEndDate)
          .eq('is_frozen', true)
          .limit(1);
        
        if (error) {
          console.warn('Error checking frozen status:', error);
          return;
        }
        
        // Week is frozen if any day in the week is frozen
        setIsWeekFrozen(frozenDays && frozenDays.length > 0);
      } catch (err) {
        console.warn('Error checking frozen status:', err);
      }
    };
    
    checkFrozenStatus();
  }, [familyId, weekStart]);

  // Handle freeze week toggle
  const handleToggleFreeze = useCallback(async () => {
    if (!familyId || !weekStart || freezeLoading) return;
    
    setFreezeLoading(true);
    try {
      const weekStartDate = getLocalDateString(getWeekStart(weekStart));
      const newFrozenState = !isWeekFrozen;
      
      const { data: result, error } = await freezeWeek(weekStartDate, newFrozenState);
      
      if (error) {
        Alert.alert('Error', `Failed to ${newFrozenState ? 'freeze' : 'unfreeze'} week: ${error.message || 'Unknown error'}`);
        return;
      }
      
      setIsWeekFrozen(newFrozenState);
      
      // Refresh calendar cache to reflect frozen state
      if (result?.updated_days_count !== undefined) {
        // Force reload by updating weekStart slightly
        handleWeekStartChange((() => {
          const newDate = new Date(weekStart);
          newDate.setMilliseconds(newDate.getMilliseconds() + 1);
          return newDate;
        })());
      }
    } catch (err) {
      Alert.alert('Error', `Failed to ${!isWeekFrozen ? 'freeze' : 'unfreeze'} week: ${err.message || 'Unknown error'}`);
    } finally {
      setFreezeLoading(false);
    }
  }, [familyId, weekStart, isWeekFrozen, freezeLoading, handleWeekStartChange]);
  

  // Ensure data.avail and data.events are arrays
  const availData = Array.isArray(data.avail) ? data.avail : [];
  const eventsData = Array.isArray(data.events) ? data.events : [];
  
  // Filter: treat null as "ALL"
  const ids = selectedChildIds?.length ? new Set(selectedChildIds) : null;
  const filtAvail = ids 
    ? availData.filter(a => ids.has(a.child_id))
    : availData;
  const filtEvents = ids
    ? eventsData.filter(e => ids.has(e.child_id))
    : eventsData;
  
  // Index avail/events by date - ALWAYS create new objects (no mutation)
  // Use useMemo to recompute when data changes
  const { availByDate, eventsByDate } = useMemo(() => {
    const availByDateNew = {};
    const eventsByDateNew = {};
    
    // Process availability windows
    for (const a of filtAvail) {
      // Normalize date string (remove timezone if present)
      // RPC returns dates like "2025-11-04T00:00:00+00:00" or "2025-11-04"
      let dateKey = null;
      if (a.date) {
        if (typeof a.date === 'string') {
          dateKey = a.date.split('T')[0]; // Extract YYYY-MM-DD part
        } else if (a.date instanceof Date) {
          dateKey = a.date.toISOString().split('T')[0];
        }
      }
      if (!dateKey) {
        console.warn('Skipping availability entry with invalid date:', a);
        continue;
      }
      
      // Handle windows as JSONB - ensure it's an array before spreading
      const windows = a.windows;
      if (!availByDateNew[dateKey]) {
        availByDateNew[dateKey] = [];
      }
      
      if (Array.isArray(windows)) {
        // Empty array [] means blackout - don't add anything
        if (windows.length > 0) {
          availByDateNew[dateKey].push(...windows);
        }
      } else if (windows && typeof windows === 'object') {
        // If it's a JSONB object, convert to array
        const windowsArray = Array.isArray(windows) ? windows : [windows];
        if (windowsArray.length > 0) {
          availByDateNew[dateKey].push(...windowsArray);
        }
      } else if (windows === null || windows === undefined) {
        // No windows = blackout (skip adding)
      }
      // If windows is empty string '[]', no windows added (blackout)
    }
    
    // Process events
    for (const e of filtEvents) {
      // Use local optimistic update if available
      const event = localEvents[e.id] || e;
      // Use date_local from RPC if available (already in family timezone)
      // Otherwise, parse start_ts using local timezone (not UTC)
      let d;
      if (event.date_local) {
        d = event.date_local; // Already a date string in YYYY-MM-DD format from RPC
      } else if (event.start_ts) {
        // Parse start_ts in local timezone to avoid UTC conversion issues
        const eventDate = new Date(event.start_ts);
        d = getLocalDateString(eventDate);
      } else {
        // Fallback: skip events without valid date
        continue;
      }
      if (!eventsByDateNew[d]) {
        eventsByDateNew[d] = [];
      }
      eventsByDateNew[d].push(event);
    }
    
    
    return { availByDate: availByDateNew, eventsByDate: eventsByDateNew };
  }, [filtAvail, filtEvents, localEvents]);
  
  // Compute version for force re-render
  const eventsVersion = useMemo(() => {
    return filtEvents.map(e => `${e.id}:${e.start_ts}:${e.end_ts}`).join('|');
  }, [filtEvents]);
  
  // Week key that changes when data changes
  const weekKey = useMemo(() => {
    const from = weekStart.toISOString().slice(0, 10);
    const to = addDays(weekStart, 7).toISOString().slice(0, 10);
    const childKey = selectedChildIds?.join(',') || 'all';
    return `${from}-${to}-${eventsVersion}-${childKey}`;
  }, [weekStart, eventsVersion, selectedChildIds]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading week...</Text>
      </View>
    );
  }

  // Use div wrapper for web (drag-drop requires DOM)
  const Wrapper = typeof window !== 'undefined' ? 'div' : View;
  const wrapperStyle = typeof window !== 'undefined' 
    ? { ...styles.wrapper, display: 'flex', flexDirection: 'column', flex: 1 }
    : styles.wrapper;
  
  // Handle mouse-based drag start
  const handleMouseDragStart = useCallback((e, eventId) => {
    if (typeof window === 'undefined') return;
    
    console.log('[PlannerWeek] Mouse drag started:', eventId);
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    setDragState({
      eventId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
    setDraggedEventId(eventId);
    
    // Store event element for visual feedback
    dragRef.current = e.currentTarget;
    
    // Add global mouse move and up handlers
    const handleMouseMove = (moveEvent) => {
      setDragState(prev => prev ? {
        ...prev,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
      } : null);
    };
    
    const handleMouseUp = async (upEvent) => {
      console.log('[PlannerWeek] Mouse drag ended');
      
      // Find which day column we're over
      const elementBelow = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      if (!elementBelow) {
        setDragState(null);
        setDraggedEventId(null);
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }
      
      // Find the day column (look for data-date attribute or parent)
      let dayColumn = elementBelow.closest('[data-day-date]');
      if (!dayColumn) {
        // Try to find parent day column by checking for day column styles
        let parent = elementBelow.parentElement;
        while (parent && parent !== document.body) {
          if (parent.getAttribute && parent.getAttribute('data-day-date')) {
            dayColumn = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }
      
      if (dayColumn) {
        const targetDateIso = dayColumn.getAttribute('data-day-date');
        console.log('[PlannerWeek] Dropped on date:', targetDateIso);
        
        // Find the event being dragged
        const allEvents = filtEvents;
        const event = allEvents.find(ev => ev.id === eventId);
        
        if (event && targetDateIso) {
          // Get original event times
          const originalStart = new Date(event.start_ts);
          const originalEnd = new Date(event.end_ts);
          const durationMs = originalEnd.getTime() - originalStart.getTime();
          
          // Parse destination date
          const destDate = new Date(targetDateIso + 'T00:00:00');
          if (!isNaN(destDate.getTime())) {
            // Compute new start time: copy time portion from original, replace date
            const newStart = new Date(destDate);
            newStart.setHours(originalStart.getHours());
            newStart.setMinutes(originalStart.getMinutes());
            newStart.setSeconds(originalStart.getSeconds());
            newStart.setMilliseconds(originalStart.getMilliseconds());
            
            // Compute new end time: add original duration
            const newEnd = new Date(newStart.getTime() + durationMs);
            
            // Optimistic update
            const optimisticEvent = {
              ...event,
              start_ts: newStart.toISOString(),
              end_ts: newEnd.toISOString(),
              date_local: getLocalDateString(newStart),
            };
            setLocalEvents(prev => ({ ...prev, [eventId]: optimisticEvent }));
            
            // Call API to reschedule
            try {
              const { data: updatedEvent, error } = await rescheduleEvent(
                eventId,
                newStart.toISOString(),
                newEnd.toISOString(),
                'drag_drop',
                'manual move'
              );
              
              if (error) {
                // Revert optimistic update on error
                console.error('Reschedule error:', error);
                setLocalEvents(prev => {
                  const next = { ...prev };
                  delete next[eventId];
                  return next;
                });
                Alert.alert('Error', `Failed to reschedule event: ${error.message || 'Unknown error'}`);
                handleWeekStartChange(new Date(weekStart));
              } else {
                // Success - update local state with server response
                if (updatedEvent) {
                  setLocalEvents(prev => ({ ...prev, [eventId]: updatedEvent }));
                }
              }
            } catch (err) {
              // Revert optimistic update on exception
              console.error('Reschedule exception:', err);
              setLocalEvents(prev => {
                const next = { ...prev };
                delete next[eventId];
                return next;
              });
              Alert.alert('Error', `Failed to reschedule event: ${err.message || 'Unknown error'}`);
              handleWeekStartChange(new Date(weekStart));
            }
          }
        }
      }
      
      setDragState(null);
      setDraggedEventId(null);
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [filtEvents, weekStart, handleWeekStartChange]);
  
  return (
    <Wrapper style={wrapperStyle}>
        {/* Header with freeze toggle */}
        <View style={styles.weekHeader}>
          <View style={styles.weekHeaderLeft}>
            <Text style={styles.weekHeaderTitle}>
              {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Text style={styles.weekHeaderSubtitle}>
              {getLocalDateString(getWeekStart(weekStart))} - {getLocalDateString(addDays(getWeekStart(weekStart), 6))}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.freezeButton, isWeekFrozen && styles.freezeButtonActive]}
            onPress={handleToggleFreeze}
            disabled={freezeLoading}
            activeOpacity={0.7}
          >
            {isWeekFrozen ? (
              <>
                <Lock size={14} color={isWeekFrozen ? colors.accentContrast : colors.text} />
                <Text style={[styles.freezeButtonText, isWeekFrozen && styles.freezeButtonTextActive]}>
                  Frozen
                </Text>
              </>
            ) : (
              <>
                <Unlock size={14} color={colors.text} />
                <Text style={styles.freezeButtonText}>
                  Freeze Week
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Week Grid - Fills available space like month grid */}
        <View style={[styles.weekGridContainer, isWeekFrozen && styles.weekGridContainerFrozen]}>
          <View style={styles.grid}>
            {/* Header Row - Single row with day name and number on same line */}
            <View style={styles.gridHeader}>
              <View style={styles.timeColumn} />
              {days.map((d, i) => (
                <View key={i} style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>
                    <Text style={styles.dayHeaderDow}>{fmtDow(d)} </Text>
                    <Text style={[
                      styles.dayHeaderDate,
                      d.getMonth() !== weekStart.getMonth() && styles.dayHeaderDateOtherMonth
                    ]}>
                      {d.getDate()}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>

            {/* Body - Scrollable vertically to show all time slots (12 AM to 12 AM) */}
            <ScrollView 
              ref={scrollViewRef}
              style={[
                styles.gridBodyScroll,
                draggedEventId && typeof window !== 'undefined' && { pointerEvents: 'auto' } // Allow drag events during drag
              ]}
              contentContainerStyle={styles.gridBody}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              contentOffset={initialScrollOffset}
              scrollEnabled={!draggedEventId} // Disable scroll while dragging
              {...(typeof window !== 'undefined' && {
                'data-scrollview-id': `scrollview-${weekStart.getTime()}`,
                onWheel: draggedEventId ? (e) => e.preventDefault() : undefined, // Prevent scroll during drag
                onDragOver: (e) => {
                  // Allow drag events to pass through ScrollView
                  e.preventDefault();
                },
              })}
              onLayout={() => {
                if (!hasScrolledTo7AM && !loading) {
                  requestAnimationFrame(() => scrollTo7AM());
                }
              }}
              onContentSizeChange={() => {
                if (!hasScrolledTo7AM && !loading) {
                  requestAnimationFrame(() => scrollTo7AM());
                }
              }}
            >
              {/* Time Ruler - Full 24 hours (12 AM to 12 AM) */}
              <View style={styles.timeRuler}>
                {Array.from({ length: Math.floor((hours.endMin - hours.startMin) / hours.step) + 1 }).map((_, i) => {
                  const labelMin = hours.startMin + i * hours.step;
                  const displayHour = Math.floor(labelMin / 60) % 24; // 0-23
                  const displayMin = labelMin % 60;
                  // Format: 12 AM, 1 AM, ..., 11 AM, 12 PM, 1 PM, ..., 11 PM, 12 AM (next day)
                  const hour12 = displayHour === 0 ? 12 : displayHour > 12 ? displayHour - 12 : displayHour;
                  const period = displayHour >= 12 ? 'PM' : 'AM';
                  const mm = displayMin.toString().padStart(2, '0');
                  return (
                    <Text 
                      key={i} 
                      style={styles.timeLabel}
                      {...(typeof window !== 'undefined' && labelMin === 420 && {
                        'data-hour': '7',
                        'data-time-label': '7:00 AM'
                      })}
                    >
                      {hour12}:{mm} {period}
                    </Text>
                  );
                })}
              </View>

              {/* Day Columns */}
              {days.map((d, i) => {
                // Use local date string (not UTC) to match events and availability
                const iso = getLocalDateString(d);
                const dayWindows = availByDate[iso] || [];
                const dayEvents = eventsByDate[iso] || [];
                
                // Find day_status for this date from availability data
                // Check ALL children - if ANY child is off, show partial blackout
                // If ALL children are off, show full blackout
                const dayAvailForDate = filtAvail.filter(a => {
                  const aDate = a.date ? a.date.split('T')[0] : null;
                  return aDate === iso;
                });
                
                const childrenOff = dayAvailForDate.filter(a => a.day_status === 'off').length;
                const totalChildren = dayAvailForDate.length;
                
                let dayStatus = null;
                if (totalChildren > 0) {
                  if (childrenOff === totalChildren) {
                    // All children are off - full blackout
                    dayStatus = 'off';
                  } else if (childrenOff > 0) {
                    // Some children are off - partial blackout (show windows but indicate partial)
                    dayStatus = 'partial';
                  }
                  // If no children are off, dayStatus remains null (normal day)
                }
                
                return (
                  <DayColumn
                    key={`${weekKey}-day-${i}-${iso}`}
                    date={d}
                    dateIso={iso}
                    hours={hours}
                    windows={dayWindows}
                    events={dayEvents}
                    dayStatus={dayStatus}
                    children={data.children || []}
                    focusedChildId={focusedChildId}
                    draggedEventId={draggedEventId}
                    onAdd={(startMin) => {
                      onAddActivity?.({ date: iso, startMin });
                    }}
                    onEventChanged={handleEventChanged}
                    onEventClick={handleEventClick}
                    onMouseDragStart={handleMouseDragStart}
                  />
                );
              })}
            </ScrollView>
          </View>
        </View>

      {/* Event Modal */}
      <EventModal
        eventId={selectedEventId}
        visible={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEventId(null);
        }}
        onEventUpdated={handleEventUpdated}
        onEventDeleted={handleEventDeleted}
      />

      {/* Reschedule Report Modal */}
      {rescheduleReport && (
        <RescheduleReportModal
          open={!!rescheduleReport}
          onClose={() => setRescheduleReport(null)}
          proposals={rescheduleReport.proposals || []}
          explanation={rescheduleReport.explanation || ''}
          onApply={async () => {
            // TODO: Implement proposal application
            console.log('Applying proposals:', rescheduleReport.proposals);
            setRescheduleReport(null);
          }}
        />
      )}

      {/* Blackout Dialog */}
      <BlackoutDialog
        visible={showBlackoutDialog}
        onClose={() => setShowBlackoutDialog(false)}
        familyId={familyId}
        children={allChildren}
        onBlackoutCreated={async (blackoutData) => {
          // Try to refresh the cache if RPC exists
          try {
            if (blackoutData?.dates && blackoutData.dates.length > 0) {
              const startDate = blackoutData.dates[0];
              const endDate = blackoutData.dates[blackoutData.dates.length - 1];
              
              // Refresh cache for blackout period
              const { error } = await supabase.rpc('refresh_calendar_days_cache', {
                p_family_id: familyId,
                p_from_date: startDate,
                p_to_date: endDate,
              });
              
              if (error) {
                if (error.code !== 'P0004') { // P0004 = function does not exist
                  console.warn('Cache refresh error:', error);
                }
              }
            }
          } catch (err) {
            // RPC might not exist, that's okay
            console.warn('Cache refresh not available:', err.message || err);
          }
          
          // Invalidate and refetch: Clear local state and force reload
          setLocalEvents({});
          
          // Force reload by updating weekStart - create new object to ensure React detects change
          handleWeekStartChange((() => {
            const newDate = new Date(weekStart);
            // Force update by toggling milliseconds
            newDate.setMilliseconds(newDate.getMilliseconds() === 0 ? 1 : 0);
            return newDate;
          })());
          
          // Auto-propose rescheduling for affected children
          // Get all children (since blackout might be family-wide)
          const affectedChildIds = selectedChildIds && selectedChildIds.length > 0 
            ? selectedChildIds 
            : allChildren.map(c => c.id);
          
          if (affectedChildIds.length > 0 && blackoutData?.dates && blackoutData.dates.length > 0) {
            setLoadingReschedule(true);
            try {
              // Find the week that contains the blackout start date
              const blackoutStart = new Date(blackoutData.dates[0]);
              const weekStartDate = startOfWeek(blackoutStart);
              const weekStartFormatted = weekStartDate.toISOString().slice(0, 10); // YYYY-MM-DD
              
              const { data: planData, error: planError } = await proposeReschedule({
                familyId,
                weekStart: weekStartFormatted,
                childIds: affectedChildIds,
                horizonWeeks: 2,
                reason: 'blackout',
              });
              
              if (planError) {
                console.warn('Failed to auto-propose reschedule:', planError);
                // Don't show error to user - it's optional
              } else if (planData) {
                // Use persisted changes from backend if available, otherwise transform proposal
                const changes = planData.changes && planData.changes.length > 0
                  ? planData.changes  // Backend returns persisted changes with database IDs
                  : (() => {
                      // Fallback: transform proposal structure (shouldn't happen, but handle gracefully)
                      const proposal = planData.proposal || {};
                      return [
                        ...(proposal.adds || []).map((add, idx) => ({
                          id: `add-${idx}-${Date.now()}`,
                          change_type: 'add',
                          event_id: null,
                          payload: add,
                        })),
                        ...(proposal.moves || []).map((move, idx) => ({
                          id: `move-${idx}-${Date.now()}`,
                          change_type: 'move',
                          event_id: move.event_id,
                          payload: move,
                        })),
                        ...(proposal.deletes || []).map((del, idx) => ({
                          id: `delete-${idx}-${Date.now()}`,
                          change_type: 'delete',
                          event_id: del.event_id,
                          payload: del,
                        })),
                      ];
                    })();
                setReschedulePlan({
                  ...planData,
                  changes,
                });
                setShowRescheduleModal(true);
              }
            } catch (err) {
              console.warn('Error auto-proposing reschedule:', err);
              // Silently fail - rescheduling is optional
            } finally {
              setLoadingReschedule(false);
            }
          }
        }}
      />

      {/* Year Planning Wizard */}
      <PlanYearWizard
        familyId={familyId}
        children={(data.children || []).map(c => ({
          id: c.id,
          first_name: c.name || c.first_name,
          avatar_url: c.avatar || c.avatar_url,
          archived: false,
        }))}
        visible={showYearWizard}
        onClose={() => setShowYearWizard(false)}
        onComplete={(yearPlan) => {
          console.log('Year plan created:', yearPlan);
          Alert.alert('Success', 'Year plan created successfully!');
          // Refresh calendar data
          setLocalEvents({});
          handleWeekStartChange(new Date(weekStart));
          setShowYearWizard(false);
        }}
      />

      {/* Reschedule Modal */}
      <RescheduleModal
        visible={showRescheduleModal}
        onClose={() => {
          setShowRescheduleModal(false);
          setReschedulePlan(null);
        }}
        planId={reschedulePlan?.planId}
        changes={reschedulePlan?.changes || []}
        summary={reschedulePlan?.summary || {}}
        onApplied={async (data) => {
          // Clear local events cache
          setLocalEvents({});
          
          setShowRescheduleModal(false);
          setReschedulePlan(null);
          
          // Force reload by creating a new date object with slightly different time
          // This ensures React detects the change and triggers useWeekData to refetch
          handleWeekStartChange((() => {
            const newDate = new Date(weekStart);
            // Add 1ms to ensure ISO string changes and triggers useEffect
            newDate.setMilliseconds(newDate.getMilliseconds() + 1);
            return newDate;
          })());
        }}
      />

      {/* Loading overlay for AI reschedule generation */}
      {loadingReschedule && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingModal}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingModalText}>Generating reschedule plan...</Text>
            <Text style={styles.loadingModalSubtext}>Analyzing availability and proposing changes</Text>
          </View>
        </View>
      )}
      </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  weekHeaderLeft: {
    flexDirection: 'column',
  },
  weekHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  weekHeaderSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  freezeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  freezeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  freezeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  freezeButtonTextActive: {
    color: colors.accentContrast,
  },
  weekGridContainer: {
    flex: 1,
    minWidth: 0, // Allow flex shrinking
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 12,
    overflow: 'hidden',
  },
  weekGridContainerFrozen: {
    opacity: 0.7,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24, // Match month view spacing
    minHeight: 40, // Prevent layout shift
    ...(typeof window !== 'undefined' && {
      willChange: 'contents', // Hint to browser for optimization
    }),
  },
  monthYearTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827', // Match month view color
    minWidth: 180, // Prevent width changes during transitions
    ...(typeof window !== 'undefined' && {
      transition: 'opacity 0.15s ease-out',
    }),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backlogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backlogButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  blackoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blackoutButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  navButton: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 16,
    color: '#374151',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.panel,
    borderRadius: 6,
    padding: 2,
    marginRight: 8,
  },
  viewToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  viewToggleButtonActive: {
    backgroundColor: colors.card,
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  viewToggleTextActive: {
    color: colors.text,
  },
  filterCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
    fontWeight: '600',
  },
  checkboxContainer: {
    gap: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  grid: {
    flex: 1,
    flexDirection: 'column',
  },
  gridHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  timeColumn: {
    width: 64,
  },
  dayHeader: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#e1e5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayHeaderText: {
    textAlign: 'center',
  },
  dayHeaderDow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  dayHeaderDate: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  dayHeaderDateOtherMonth: {
    color: '#d1d5db',
  },
  gridBodyScroll: {
    flex: 1,
  },
  gridBody: {
    flexDirection: 'row',
    // Full 24-hour day: 24 hours * 60px per hour = 1440px minimum height
    minHeight: 24 * 60, // 1440px for full day
    paddingBottom: 20, // Extra padding at bottom for scrolling
  },
  timeRuler: {
    width: 64,
    paddingTop: 8,
  },
  timeLabel: {
    fontSize: 10,
    color: colors.muted,
    marginBottom: 52,
    paddingLeft: 4,
  },
  dayColumnDragOver: {
    backgroundColor: '#f0f9ff',
    borderColor: colors.blueBold,
    borderWidth: 2,
  },
  dayColumn: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    position: 'relative',
  },
  dayColumnBlackout: {
    backgroundColor: colors.panel,
    opacity: 0.6,
  },
  dayColumnPartialBlackout: {
    backgroundColor: colors.panel,
    opacity: 0.3, // Lighter than full blackout
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  blackoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  blackoutText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  partialBlackoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 193, 7, 0.05)', // Light yellow/orange tint
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  partialBlackoutText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  availWindow: {
    position: 'absolute',
    left: 4,
    right: 4,
    backgroundColor: colors.greenSoft + '80',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.greenSoft,
  },
  eventBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    ...shadows.sm,
  },
  eventText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  addOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingModal: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    ...shadows.lg,
  },
  loadingModalText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  loadingModalSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
});

