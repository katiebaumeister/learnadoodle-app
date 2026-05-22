import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Calendar, Sparkles, List, Lock, Unlock, Printer } from 'lucide-react';
// Using native HTML5 drag-and-drop instead of @hello-pangea/dnd for React Native Web compatibility
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import DraggableEvent from './DraggableEvent';
// Re-enabling step by step
import EventModal from '../events/EventModal';
import RescheduleReportModal from './RescheduleReportModal';
import BlackoutDialog from './BlackoutDialog';
import RescheduleModal from './RescheduleModal';
import WeeklyReshuffleModal from './WeeklyReshuffleModal';
import { proposeReschedule, getWeekStart, freezeWeek, getWeeklyPacket } from '../../lib/apiClient';
import { getHolidaysForRange } from '../../lib/services/academicYearClient';
import { rescheduleEvent, createEvent as createEventWithOffline, deleteEvent as deleteEventWithOffline } from '../../lib/services/plannerClientWithOffline';
import * as offlineStorage from '../../lib/services/offlineStorage';
import PlanYearWizard from '../year/PlanYearWizard';
import SaveTemplateModal from '../templates/SaveTemplateModal';
// import ConstraintsTimeline from '../../app/components/schedule/ConstraintsTimeline';
import { logDragDrop, logDeleteEvent } from '../../app/services/plannerInstrumentation';
import NoteEditorModal from '../records/NoteEditorModal';
import { isPartOfRecurringSeries } from '../../lib/utils/recurringEventUtils';

// Helper functions
function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // Sunday=0, Monday=1, ..., Saturday=6
  x.setDate(x.getDate() - day); // Subtract to get Sunday
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
    return 0; // Default to midnight
  }
  const parts = hhmm.split(':');
  if (parts.length < 2) {
    return 0;
  }
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) {
    return 0;
  }
  return h * 60 + m;
}

// Import offline-enabled week data hook
import { useWeekDataWithOffline } from './useWeekDataWithOffline';

// Custom hook for week data (keeping original for backward compatibility, but using offline version)
function useWeekData(weekStart, childIds, familyId) {
  return useWeekDataWithOffline(weekStart, childIds, familyId);
}

// Day Column Component
function DayColumn({ date, dateIso, hours, windows, events, onAdd, onEventChanged, onEventClick, dayStatus, children = [], focusedChildId = null, draggedEventId = null, onMouseDragStart = null, familyId = null }) {
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

  // Use View for both platforms (React Native Web handles data attributes)
  return (
    <View 
      {...(typeof window !== 'undefined' && {
        'data-day-date': dateIso || getLocalDateString(date)
      })}
      style={[
        styles.dayColumn,
        isBlackout && styles.dayColumnBlackout,
        isPartialBlackout && styles.dayColumnPartialBlackout
      ]}
    >
            {/* Hour lines */}
            {Array.from({ length: Math.floor(total / step) + 1 }).map((_, i) => {
              const y = (i * step / total) * 100;
              return (
                <View
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
                return (
                  <View
                    key={idx}
                    style={[
                      styles.availWindow,
                      { top: `${s}%`, height: `${h}%` }
                    ]}
                  />
                );
              })}
            
            {/* Blackout indicator overlay - full blackout */}
            {isBlackout && (
              <View style={styles.blackoutOverlay}>
                <Text style={styles.blackoutText}>No Availability</Text>
              </View>
            )}
            
            {/* Partial blackout indicator - some children off */}
            {isPartialBlackout && (
              <View style={styles.partialBlackoutOverlay}>
                <Text style={styles.partialBlackoutText}>Partial Availability</Text>
              </View>
            )}

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
              const isHoliday = (ev.event_type || ev.type || '').toLowerCase() === 'holiday';
              const canDrag = !isBlackout && ev.status !== 'done' && !isHoliday;
              
              // Use View for both platforms with mouse drag handlers on web
              return (
                <View
                  key={ev.id}
                  {...(typeof window !== 'undefined' && {
                    onMouseDown: (e) => {
                      const mouseButton = typeof e.button === 'number' ? e.button : e.nativeEvent?.button;
                      if (typeof mouseButton === 'number' && mouseButton !== 0) return; // Left click only when provided
                      console.log('[PlannerWeek] onMouseDown triggered', { canDrag, hasHandler: !!onMouseDragStart, eventId: ev.id });
                      if (canDrag && onMouseDragStart) {
                        e.stopPropagation();
                        onMouseDragStart(e, ev.id);
                      }
                    },
                    onClick: (e) => {
                      // Only handle click if not dragging
                      if (!isDragging) {
                        e.stopPropagation();
                        if (onEventClick) {
                          onEventClick(ev);
                        }
                      }
                    },
                  })}
                  style={[
                    {
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${Math.max(0, top)}%`,
                      height: `${heightPercent}%`,
                      zIndex: isDragging ? 1000 : 10,
                    },
                    typeof window !== 'undefined' && {
                      cursor: canDrag ? 'grab' : 'default',
                      // Don't change opacity/transform here - drag ghost handles visual feedback
                      // This avoids React re-renders during drag for better performance
                      touchAction: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                    }
                  ]}
                >
                  <DraggableEvent
                    ev={ev}
                    dayStartMin={hours.startMin}
                    dayEndMin={hours.endMin}
                    totalMin={total}
                    isBlackoutDay={isBlackout}
                    onChanged={(patched) => onEventChanged(ev.id, patched)}
                    onClick={(clickedEv) => {
                      // Only handle click if not dragging
                      if (!isDragging && onEventClick) {
                        onEventClick(clickedEv);
                      }
                    }}
                    children={children}
                    focusedChildId={focusedChildId}
                    isWrapped={true}
                    familyId={familyId}
                  />
                </View>
              );
            })}

          {/* Click to add overlay - only captures clicks on empty space (hidden when read-only / no onAdd) */}
          {onAdd && (typeof window === 'undefined' ? (
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
            <View
              style={styles.addOverlay}
              {...(typeof window !== 'undefined' && {
                onClick: (e) => {
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
                }
              })}
            />
          ))}
    </View>
  );
}

export default function PlannerWeek({ familyId, onAddActivity, onOpenAIPlanner, selectedChildIds, onChildFilterChange, onViewChange, weekStart: propWeekStart, onWeekStartChange, onEventSelect, readOnly = false }) {
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
  const [showWeeklyReshuffle, setShowWeeklyReshuffle] = useState(false);
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
  const isDraggingRef = useRef(false); // Track if we're actually dragging (not just clicking)
  const [dragDebugInfo, setDragDebugInfo] = useState({
    status: 'idle',
    eventId: null,
    targetDateIso: null,
    lastError: null,
    lines: [],
  });
  const lastMoveDebugAtRef = useRef(0);
  const [isWeekFrozen, setIsWeekFrozen] = useState(false); // Track if current week is frozen
  const [freezeLoading, setFreezeLoading] = useState(false); // Loading state for freeze toggle
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteEditorProps, setNoteEditorProps] = useState({
    linkedEventId: null,
    defaultChildId: null,
    defaultText: '',
  });
  const [weekHolidays, setWeekHolidays] = useState([]);

  const { data, loading } = useWeekData(weekStart, selectedChildIds, familyId);

  // Fetch holidays for the visible week so they show on the week view
  useEffect(() => {
    if (!familyId) return;
    const from = getLocalDateString(weekStart);
    const to = getLocalDateString(addDays(weekStart, 6));
    getHolidaysForRange(familyId, from, to).then(({ data: res, error }) => {
      if (error) return;
      setWeekHolidays(res?.holidays || []);
    });
  }, [familyId, weekStart]);

  // Memoize formatted month/year to prevent unnecessary recalculations
  const monthYearText = useMemo(() => {
    return weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [weekStart.getFullYear(), weekStart.getMonth()]);

  const pushDragDebug = useCallback((phase, payload = {}) => {
    if (typeof window === 'undefined' || Platform.OS !== 'web') return;
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();
    const safePayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => {
        const t = typeof value;
        return value == null || t === 'string' || t === 'number' || t === 'boolean';
      })
    );
    const line = `${timeLabel} ${phase} ${JSON.stringify(safePayload)}`;
    console.log('[PlannerWeek][DND DEBUG]', phase, safePayload);
    setDragDebugInfo(prev => ({
      status: payload.status || phase,
      eventId: payload.eventId ?? prev.eventId,
      targetDateIso: payload.targetDateIso ?? prev.targetDateIso,
      lastError: payload.error ?? prev.lastError,
      lines: [line, ...prev.lines].slice(0, 12),
    }));
    window.__plannerWeekDragDebug = {
      at: now.toISOString(),
      phase,
      payload: safePayload,
    };
    window.dispatchEvent(new CustomEvent('plannerWeekDragDebug', {
      detail: { at: now.toISOString(), phase, payload: safePayload },
    }));
  }, []);

  // Listen for openNoteEditor custom event
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleOpenNoteEditor = (event) => {
      const detail = event.detail || {};
      setNoteEditorProps({
        linkedEventId: detail.eventId || null,
        defaultChildId: detail.childId || null,
        defaultText: detail.defaultText || '',
      });
      setShowNoteEditor(true);
    };
    
    window.addEventListener('openNoteEditor', handleOpenNoteEditor);
    return () => {
      window.removeEventListener('openNoteEditor', handleOpenNoteEditor);
    };
  }, []);

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
    const { destination, source, draggableId } = result;
    
    // If no destination, do nothing (drag cancelled)
    if (!destination) {
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
    // Filter events based on selected children
    const eventsData = Array.isArray(data.events) ? data.events : [];
    const ids = selectedChildIds?.length ? new Set(selectedChildIds) : null;
    const allEvents = ids
      ? eventsData.filter(e => ids.has(e.child_id))
      : eventsData;
    const event = allEvents.find(e => e.id === eventId);
    
    if (!event) {
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
    
    // Call API to reschedule with offline support
    try {
      const { data: updatedEvent, error } = await rescheduleEvent(
        eventId,
        newStart.toISOString(),
        newEnd.toISOString(),
        'drag_drop',
        'manual move',
        familyId
      );
      
      if (error) {
        // Revert optimistic update on error

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
        // Success - don't overwrite optimistic update with server response
        // The optimistic update already has the correct date_local
        // We'll keep it until fresh data arrives from the refresh
        
        // Log drag-drop action
        const fromDateStr = getLocalDateString(originalStart);
        const toDateStr = getLocalDateString(newStart);
        const fromTimeStr = `${String(originalStart.getHours()).padStart(2, '0')}:${String(originalStart.getMinutes()).padStart(2, '0')}`;
        const toTimeStr = `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`;
        
        logDragDrop(
          eventId,
          fromDateStr,
          toDateStr,
          fromTimeStr,
          toTimeStr,
          event.child_id
        );
      }
    } catch (err) {
      // Revert optimistic update on exception

      setLocalEvents(prev => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      Alert.alert('Error', `Failed to reschedule event: ${err.message || 'Unknown error'}`);
      handleWeekStartChange(new Date(weekStart));
    }
  }, [data.events, selectedChildIds, weekStart, handleWeekStartChange]);

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

  const handleRepeatNextWeek = async (event) => {
    if (!event || !event.id) {
      return;
    }

    try {
      // Calculate new dates (7 days later)
      const originalStart = new Date(event.start_ts);
      const originalEnd = event.end_ts ? new Date(event.end_ts) : null;
      
      const newStart = new Date(originalStart);
      newStart.setDate(newStart.getDate() + 7);
      
      const newEnd = originalEnd ? new Date(originalEnd) : null;
      if (newEnd) {
        newEnd.setDate(newEnd.getDate() + 7);
      }

      // Calculate duration in minutes
      const durationMs = originalEnd 
        ? (originalEnd.getTime() - originalStart.getTime())
        : (event.minutes || 60) * 60 * 1000;
      const minutes = Math.round(durationMs / 60000);

      // Use offline-enabled create event
      const eventData = {
        family_id: event.family_id || familyId,
        child_id: event.child_id,
        title: event.title || 'Untitled Event',
        start_ts: newStart.toISOString(),
        description: event.description || null,
        end_ts: newEnd ? newEnd.toISOString() : null,
        status: 'scheduled',
        source: 'manual',
        tags: event.tags || null,
        is_flexible: event.is_flexible || false,
        event_type: event.event_type || null,
        subject_id: event.subject_id || null,
        unit: event.unit || null,
        grade: event.grade || null,
        location: event.location || null,
        mode: event.mode || null,
        instructor: event.instructor || null,
        goal_link: event.goal_link || null,
        minutes: minutes,
        materials_attachment_ids: event.materials_attachment_ids || null,
        source_link: event.source_link || null,
        resume_position: event.resume_position || null,
        counts_toward_plan: ((event.event_type || '').toLowerCase() === 'lesson') ? true : undefined,
      };
      
      const { data: rpcData, error: rpcError } = await createEventWithOffline(eventData, familyId);

      if (rpcError || !rpcData) {
        const errorMsg = rpcError?.message || 'Failed to repeat event';

        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to repeat event: ${errorMsg}`);
        }
        return;
      }

      // Refresh week data
      handleWeekStartChange(new Date(weekStart));

      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Event repeated for next week successfully');
      }
    } catch (error) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Error repeating event: ' + error.message);
      }
    }
  };

  const handleCopyToNextYear = async (event) => {
    if (!event || !event.id) {
      return;
    }

    try {
      // Calculate new dates (1 year later)
      const originalStart = new Date(event.start_ts);
      const originalEnd = event.end_ts ? new Date(event.end_ts) : null;
      
      const newStart = new Date(originalStart);
      newStart.setFullYear(newStart.getFullYear() + 1);
      
      const newEnd = originalEnd ? new Date(originalEnd) : null;
      if (newEnd) {
        newEnd.setFullYear(newEnd.getFullYear() + 1);
      }

      // Calculate duration in minutes
      const durationMs = originalEnd 
        ? (originalEnd.getTime() - originalStart.getTime())
        : (event.minutes || 60) * 60 * 1000;
      const minutes = Math.round(durationMs / 60000);

      // Use offline-enabled create event
      const eventData = {
        family_id: event.family_id || familyId,
        child_id: event.child_id,
        title: event.title || 'Untitled Event',
        start_ts: newStart.toISOString(),
        description: event.description || null,
        end_ts: newEnd ? newEnd.toISOString() : null,
        status: 'scheduled',
        source: 'manual',
        tags: event.tags || null,
        is_flexible: event.is_flexible || false,
        event_type: event.event_type || null,
        subject_id: event.subject_id || null,
        unit: event.unit || null,
        grade: event.grade || null,
        location: event.location || null,
        mode: event.mode || null,
        instructor: event.instructor || null,
        goal_link: event.goal_link || null,
        minutes: minutes,
        materials_attachment_ids: event.materials_attachment_ids || null,
        source_link: event.source_link || null,
        resume_position: event.resume_position || null,
        counts_toward_plan: ((event.event_type || '').toLowerCase() === 'lesson') ? true : undefined,
      };
      
      const { data: rpcData, error: rpcError } = await createEventWithOffline(eventData, familyId);

      if (rpcError || !rpcData) {
        const errorMsg = rpcError?.message || 'Failed to copy event';

        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to copy event: ${errorMsg}`);
        }
        return;
      }

      // Refresh week data
      handleWeekStartChange(new Date(weekStart));

      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Event copied to next year successfully');
      }
    } catch (error) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Error copying event: ' + error.message);
      }
    }
  };

  const handleEventRightClick = (event, nativeEvent) => {
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

      // Create context menu directly in DOM (same pattern as WebContent)
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }
      
      // For project events that may have been expanded, use the original ID
      // Check for _originalId, originalId, or extract from expanded ID format (id-day-X)
      let eventId = event._originalId || event.originalId || event.id;
      
      // If the ID contains '-day-', it's an expanded project event - extract the original ID
      if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
        eventId = eventId.split('-day-')[0];
      }
      
      const menuItems = [];
      
      menuItems.push({ text: 'Edit Event', action: () => handleEventClick(event) });
      
      // Check if event is recurring
      const isRecurringEvent = isPartOfRecurringSeries(event);
      
      if (isRecurringEvent) {
        // Show options for recurring events
        menuItems.push({ 
          text: 'Delete This Event', 
          action: async () => {
            if (window.confirm('Are you sure you want to delete only this occurrence?')) {
              try {
                // Extract original ID if it's an expanded event (must be done BEFORE RPC call)
                let cleanEventId = eventId;
                if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
                  cleanEventId = eventId.split('-day-')[0];
                }
                
                // Validate UUID format
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(cleanEventId)) {
                  console.error('[PlannerWeek] Invalid UUID format:', cleanEventId);
                  throw new Error(`Invalid event ID format: ${cleanEventId}`);
                }
                
                console.log('[PlannerWeek] Deleting recurring event occurrence:', { 
                  cleanEventId, 
                  originalEventId: eventId,
                  eventType: event.event_type, 
                  originalId: event._originalId, 
                  eventIdFromEvent: event.id 
                });
                
                // Use RPC function for reliable deletion (bypasses RLS with SECURITY DEFINER)
                const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', {
                  _event_id: cleanEventId,
                  _family_id: familyId
                });
                
                console.log('[PlannerWeek] RPC delete response:', { rpcData, rpcError });
                
                if (rpcError) {
                  console.warn('[PlannerWeek] RPC delete failed, falling back to deleteEventWithOffline:', rpcError);
                  // Fall back to offline delete
                  const result = await deleteEventWithOffline(cleanEventId, familyId);
                  if (result?.error) {
                    throw new Error(result.error.message || 'Failed to delete event');
                  }
                } else if (!rpcData?.success) {
                  console.warn('[PlannerWeek] RPC delete returned failure:', rpcData);
                  // Fall back to offline delete
                  const result = await deleteEventWithOffline(cleanEventId, familyId);
                  if (result?.error) {
                    throw new Error(result.error.message || 'Failed to delete event');
                  }
                } else {
                  console.log('[PlannerWeek] RPC delete succeeded (soft delete):', rpcData);
                  
                  // Verify the soft delete actually worked (wait a bit for DB to update)
                  await new Promise(resolve => setTimeout(resolve, 300));
                  const { data: verifyData } = await supabase
                    .from('events')
                    .select('deleted_at')
                    .eq('id', cleanEventId)
                    .maybeSingle();
                  
                  if (verifyData?.deleted_at) {
                    console.log('[PlannerWeek] Delete verified - deleted_at is set');
                  } else {
                    console.warn('[PlannerWeek] Delete verification failed - deleted_at not set yet');
                  }
                }
                
                handleEventDeleted(cleanEventId);
                // Trigger refresh
                handleWeekStartChange(new Date(weekStart));
              } catch (err) {
                console.error('[PlannerWeek] Delete error:', err);
                Alert.alert('Error', `Failed to delete event: ${err.message || 'Unknown error'}`);
              }
            }
          }, 
          isDelete: true 
        });
        if (!event.academic_year_id) menuItems.push({ 
          text: 'Delete All in Series', 
          action: async () => {
            if (window.confirm('Are you sure you want to delete all occurrences in this series?')) {
              try {
                // Clean the eventId first (remove -day-X suffix if present)
                let cleanEventId = eventId;
                if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
                  cleanEventId = eventId.split('-day-')[0];
                }
                
                // Find the master event ID (the root of the recurrence series)
                // For instances: parent_event_id or recurrence_id points to the master
                // For master events: parent_event_id and recurrence_id are set to its own ID
                let masterEventId = event.parent_event_id || event.recurrence_id;
                
                // Clean masterEventId if it has -day-X suffix
                if (masterEventId && typeof masterEventId === 'string' && masterEventId.includes('-day-')) {
                  masterEventId = masterEventId.split('-day-')[0];
                }
                
                // If this is a master event (has recurrence_rule), use its own ID
                if (event.recurrence_rule && !masterEventId) {
                  masterEventId = cleanEventId;
                }
                
                // Fallback to cleanEventId if we still don't have a master ID
                if (!masterEventId) {
                  masterEventId = cleanEventId;
                }
                
                console.log('[PlannerWeek] Deleting all in series:', { 
                  cleanEventId, 
                  masterEventId,
                  originalEventId: eventId,
                  eventType: event.event_type
                });
                
                // Soft delete all events in the series using deleted_at timestamp
                // 1. The master event (id = masterEventId)
                // 2. All instances (parent_event_id = masterEventId OR recurrence_id = masterEventId)
                const { error: seriesError } = await supabase
                  .from('events')
                  .update({ deleted_at: new Date().toISOString() })
                  .or(`id.eq.${masterEventId},parent_event_id.eq.${masterEventId},recurrence_id.eq.${masterEventId}`)
                  .is('deleted_at', null); // Only update if not already deleted
                
                if (seriesError) {
                  console.warn('[PlannerWeek] Error deleting series, falling back to single delete:', seriesError);
                  // Fall back to single delete using RPC
                  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', {
                    _event_id: cleanEventId,
                    _family_id: familyId
                  });
                  
                  if (rpcError || !rpcData?.success) {
                    // Final fallback to offline delete
                    await deleteEventWithOffline(cleanEventId, familyId);
                  }
                } else {
                  console.log('[PlannerWeek] Series soft delete succeeded');
                }
                
                handleEventDeleted(cleanEventId);
                // Trigger refresh
                handleWeekStartChange(new Date(weekStart));
              } catch (err) {
                console.error('[PlannerWeek] Delete series error:', err);
                Alert.alert('Error', `Failed to delete event series: ${err.message || 'Unknown error'}`);
              }
            }
          }, 
          isDelete: true 
        });
      } else {
        // Regular delete for non-recurring events
        menuItems.push({ text: 'Delete Event', action: async () => {
          if (window.confirm('Are you sure you want to delete this event?')) {
            try {
              // Validate eventId is a valid UUID (not an expanded ID)
              if (!eventId || typeof eventId !== 'string') {
                throw new Error('Invalid event ID');
              }
              
              // Ensure we're using a valid UUID format (remove any -day-X suffix)
              const cleanEventId = eventId.split('-day-')[0];
              
              // Validate UUID format
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!uuidRegex.test(cleanEventId)) {
                console.error('[PlannerWeek] Invalid UUID format:', cleanEventId);
                throw new Error(`Invalid event ID format: ${cleanEventId}`);
              }
              
              console.log('[PlannerWeek] Deleting event:', { 
                cleanEventId, 
                originalEventId: eventId,
                eventType: event.event_type, 
                originalId: event._originalId, 
                eventIdFromEvent: event.id 
              });
              // Optimistically remove from planner UI immediately.
              handleEventDeleted(cleanEventId);
              window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: cleanEventId } }));
              window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
              
              // Use RPC function for reliable deletion (bypasses RLS with SECURITY DEFINER)
              // This is especially important for project events - uses soft delete (deleted_at)
              const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', {
                _event_id: cleanEventId,
                _family_id: familyId
              });
              
              console.log('[PlannerWeek] RPC delete response:', { rpcData, rpcError });
              
              if (rpcError) {
                console.error('[PlannerWeek] RPC delete failed:', rpcError);
                console.warn('[PlannerWeek] RPC delete failed, falling back to deleteEventWithOffline:', rpcError);
                // Fall back to offline delete
                const result = await deleteEventWithOffline(cleanEventId, familyId);
                if (result?.error) {
                  throw new Error(result.error.message || 'Failed to delete event');
                }
              } else if (!rpcData?.success) {
                console.error('[PlannerWeek] RPC delete returned failure:', rpcData);
                console.warn('[PlannerWeek] RPC delete returned failure, falling back to deleteEventWithOffline:', rpcData);
                // Fall back to offline delete
                const result = await deleteEventWithOffline(cleanEventId, familyId);
                if (result?.error) {
                  throw new Error(result.error.message || 'Failed to delete event');
                }
              } else {
                console.log('[PlannerWeek] RPC delete succeeded (soft delete):', rpcData);
                
                // Verify the soft delete actually worked (wait a bit for DB to update)
                await new Promise(resolve => setTimeout(resolve, 300));
                const { data: verifyData } = await supabase
                  .from('events')
                  .select('deleted_at')
                  .eq('id', cleanEventId)
                  .maybeSingle();
                
                if (verifyData?.deleted_at) {
                  console.log('[PlannerWeek] Soft delete verified - deleted_at is set:', verifyData.deleted_at);
                } else {
                  console.warn('[PlannerWeek] Delete verification failed - deleted_at not set yet');
                }
              }
              
              // Trigger refresh after successful delete to reconcile server truth.
              handleWeekStartChange(new Date(weekStart));
            } catch (err) {
              console.error('[PlannerWeek] Delete error:', err);
              // Re-sync planner state if optimistic delete fails.
              window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
              Alert.alert('Error', `Failed to delete event: ${err.message || 'Unknown error'}`);
            }
          }
        }, isDelete: true });
      }
      // Calculate menu height (estimate: ~48px per item + 16px padding)
      const estimatedMenuHeight = menuItems.length * 48 + 16;
      const windowHeight = window.innerHeight;
      
      // Check if menu would go off bottom of screen
      // If so, position it above the click point instead
      let menuTop = clientY;
      if (clientY + estimatedMenuHeight > windowHeight) {
        // Position above the click point
        menuTop = clientY - estimatedMenuHeight;
        // Ensure it doesn't go off the top either
        if (menuTop < 0) {
          menuTop = 8; // Small margin from top
        }
      }
      
      // Also check if menu would go off right side of screen
      let menuLeft = clientX;
      const estimatedMenuWidth = 200; // min-width
      const windowWidth = window.innerWidth;
      if (clientX + estimatedMenuWidth > windowWidth) {
        // Position to the left of the click point
        menuLeft = clientX - estimatedMenuWidth;
        // Ensure it doesn't go off the left either
        if (menuLeft < 0) {
          menuLeft = 8; // Small margin from left
        }
      }
      
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${menuTop}px;
        left: ${menuLeft}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;
      
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
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('contextmenu', closeMenu, true);
        }
      };
      // Use bubble phase for click (so menu item handlers fire first)
      // Use capture phase for mousedown/contextmenu to catch right-clicks
      document.addEventListener('click', closeMenu);
      document.addEventListener('mousedown', closeMenu, true);
      document.addEventListener('contextmenu', closeMenu, true);
    }
  };

  const handleEventUpdated = () => {
    // Refetch week data
    setLocalEvents({});
    handleWeekStartChange(new Date(weekStart));
  };

  const handleEventDeleted = async (deletedEventId) => {
    // Find the deleted event to get its details for logging
    if (deletedEventId) {
      // Filter events based on selected children
      const eventsData = Array.isArray(data.events) ? data.events : [];
      const ids = selectedChildIds?.length ? new Set(selectedChildIds) : null;
      const allEvents = ids
        ? eventsData.filter(e => ids.has(e.child_id))
        : eventsData;
      const deletedEvent = allEvents.find(e => e.id === deletedEventId || e._originalId === deletedEventId);
      if (deletedEvent) {
        const eventDate = new Date(deletedEvent.start_ts);
        const dateStr = getLocalDateString(eventDate);
        
        // Log delete event action
        logDeleteEvent(
          deletedEventId,
          dateStr,
          deletedEvent.child_id
        );
      }
      
      // Clear from offline cache immediately
      try {
        await offlineStorage.removeEvent(deletedEventId);
        console.log('[PlannerWeek] Removed event from offline cache:', deletedEventId);
      } catch (err) {
        console.warn('[PlannerWeek] Error removing event from offline cache:', err);
      }
    }
    
    // Remove from local optimistic updates
    setLocalEvents(prev => {
      const next = { ...prev };
      // Remove the deleted event and any expanded versions
      Object.keys(next).forEach(key => {
        if (key === deletedEventId || key.startsWith(`${deletedEventId}-day-`)) {
          delete next[key];
        }
      });
      return next;
    });
    
    // Dispatch refresh event for other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
      window.dispatchEvent(new CustomEvent('eventDeleted', { 
        detail: { eventId: deletedEventId, id: deletedEventId } 
      }));
    }
    
    // Refetch week data
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
          if (scrollElement && typeof scrollElement.scrollTo === 'function') {
            try {
              scrollElement.scrollTo({ y: 420, animated: false });
              setHasScrolledTo7AM(true);
              return true;
            } catch (err) {
              // Ignore scroll errors
              console.warn('[PlannerWeek] Scroll error:', err);
            }
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
      if (scrollElement && typeof scrollElement.scrollTo === 'function') {
        try {
          scrollElement.scrollTo({ y: 420, animated: false });
          setHasScrolledTo7AM(true);
        } catch (err) {
          // Ignore scroll errors
          console.warn('[PlannerWeek] Scroll error:', err);
        }
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
          return;
        }
        
        // Week is frozen if any day in the week is frozen
        setIsWeekFrozen(frozenDays && frozenDays.length > 0);
      } catch (err) {
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

  // Allow global header controls to toggle freeze state (web only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleGlobalToggle = () => {
      handleToggleFreeze();
    };

    window.addEventListener('plannerToggleFreezeWeek', handleGlobalToggle);
    return () => {
      window.removeEventListener('plannerToggleFreezeWeek', handleGlobalToggle);
    };
  }, [handleToggleFreeze]);

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
  
  // Log when filtEvents changes to debug refresh issues
  useEffect(() => {
    console.log('[PlannerWeek] filtEvents updated', {
      count: filtEvents.length,
      eventIds: filtEvents.map(e => ({ id: e.id, date_local: e.date_local, start_ts: e.start_ts }))
    });
  }, [filtEvents]);
  
  // Clear optimistic updates when fresh data arrives with updated events
  useEffect(() => {
    if (filtEvents.length === 0) return;
    
    // Check if any localEvents have been updated in the fresh data
    setLocalEvents(prev => {
      const next = { ...prev };
      let changed = false;
      
      for (const eventId in next) {
        const optimisticEvent = next[eventId];
        const freshEvent = filtEvents.find(e => e.id === eventId);
        
        // If fresh data has the event, clear the optimistic update
        // The fresh data from the server is now the source of truth
        if (freshEvent) {
          // Delay clearing optimistic update to prevent visual jump
          // The optimistic update keeps the event visible in the new position
          // until React has fully rendered with the fresh data
          const optimisticDate = optimisticEvent.date_local || optimisticEvent.start_ts?.slice(0, 10);
          const freshDate = freshEvent.date_local || freshEvent.start_ts?.slice(0, 10);
          
          // Compare timestamps to see if the change was confirmed
          const optimisticTime = optimisticEvent.start_ts;
          const freshTime = freshEvent.start_ts;
          
          // Check if times are very close (within 1 minute) - if so, server confirmed the change
          const timeMatch = optimisticTime && freshTime && 
            Math.abs(new Date(optimisticTime).getTime() - new Date(freshTime).getTime()) < 60000;
          
          // If the server confirmed the change (times/dates match), DON'T clear the optimistic update
          // The optimistic update already shows the event in the correct position
          // Clearing it would cause a re-render and potential jump
          // Only clear if there's a significant difference (server adjusted the time/date)
          const datesMatch = optimisticDate === freshDate;
          const timesClose = timeMatch; // Times within 1 minute
          
          // PRIORITY: If times are close, server confirmed the change
          // Keep optimistic update exactly as-is - don't update it at all
          // Since times are close, the event is already in approximately the right position
          // Updating date_local would cause a state change and visual jump
          // The optimistic update will naturally be replaced on next week change or page refresh
          if (timesClose) {
            // Server confirmed the change (times are close) - keep optimistic update exactly as-is
            // Don't modify it - any update would cause a state change and visual jump
            // Since times are close, the event is already in the right position
            console.log('[PlannerWeek] Keeping optimistic update as-is (times close, server confirmed)', {
              eventId,
              optimisticDate,
              freshDate,
              datesMatch,
              timesClose
            });
            // Don't change anything - leave optimistic update exactly as it is
          } else if (datesMatch) {
            // Dates match but times don't - server adjusted time significantly
            // Update optimistic update to match fresh data synchronously
            if (next[eventId]) {
              next[eventId] = {
                ...next[eventId],
                start_ts: freshEvent.start_ts,
                end_ts: freshEvent.end_ts,
                start_local: freshEvent.start_local,
                end_local: freshEvent.end_local
              };
              changed = true;
              console.log('[PlannerWeek] Updated optimistic update time to match fresh data', {
                eventId,
                optimisticDate,
                freshDate,
                datesMatch
              });
            }
          } else {
            // Dates don't match AND times are very different - clear optimistic update immediately
            // Using fresh data directly prevents jump
            delete next[eventId];
            changed = true;
            console.log('[PlannerWeek] Cleared optimistic update (dates/times differ significantly)', {
              eventId,
              optimisticDate,
              freshDate,
              datesMatch,
              timesClose
            });
          }
        }
      }
      
      return changed ? next : prev;
    });
  }, [filtEvents]);
  
  // Index avail/events by date - ALWAYS create new objects (no mutation)
  // Use useMemo to recompute when data changes
  const { availByDate, eventsByDate, patternDaysByDate } = useMemo(() => {
    const availByDateNew = {};
    const eventsByDateNew = {};
    const patternDaysByDateNew = {}; // Store pattern days by date
    
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
        continue;
      }
      
      // Store pattern_day for this date (use first child's pattern_day if multiple children)
      if (a.pattern_day && !patternDaysByDateNew[dateKey]) {
        patternDaysByDateNew[dateKey] = a.pattern_day;
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
      let event = localEvents[e.id] || e;
      
      // WORKAROUND: If start_local is missing but start_ts exists, compute it
      // This handles cases where cached events don't have start_local
      if (!event.start_local && event.start_ts) {
        try {
          // Convert UTC timestamp to local time (America/New_York)
          // Note: This is a temporary workaround until cache is fully refreshed
          const utcDate = new Date(event.start_ts);
          // Get local time in browser timezone (should match family timezone)
          const localHours = utcDate.getHours();
          const localMinutes = utcDate.getMinutes();
          event = {
            ...event,
            start_local: `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`,
            // Also compute end_local if missing
            end_local: event.end_local || (event.end_ts ? (() => {
              const endUtc = new Date(event.end_ts);
              return `${String(endUtc.getHours()).padStart(2, '0')}:${String(endUtc.getMinutes()).padStart(2, '0')}`;
            })() : undefined),
            // Compute date_local if missing
            date_local: event.date_local || getLocalDateString(utcDate)
          };
          
          if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.warn('[PlannerWeek] ⚠️ Computed start_local from start_ts (workaround):', {
              eventId: event.id,
              title: event.title,
              computedStartLocal: event.start_local,
              start_ts: event.start_ts,
              note: 'This is a temporary workaround. Cache should be refreshed to get start_local from RPC.'
            });
          }
        } catch (err) {
          console.error('[PlannerWeek] Error computing start_local:', err);
        }
      }
      
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

    // Add holidays for the week (from backend) so they show on the week view
    for (const h of weekHolidays) {
      const dateStr = typeof h.date === 'string' ? h.date.split('T')[0] : (h.date?.toISOString?.()?.split('T')[0] || null);
      if (!dateStr) continue;
      const holidayEvent = {
        id: `holiday-${dateStr}-${(h.name || '').replace(/\s+/g, '-').slice(0, 30)}`,
        date_local: dateStr,
        title: h.name || 'Holiday',
        event_type: 'holiday',
        type: 'holiday',
        start_ts: `${dateStr}T00:00:00`,
        end_ts: `${dateStr}T00:30:00`,
        start_local: '00:00',
        end_local: '00:30',
      };
      if (!eventsByDateNew[dateStr]) eventsByDateNew[dateStr] = [];
      eventsByDateNew[dateStr].push(holidayEvent);
    }

    // Log eventsByDate for debugging
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const eventDates = Object.keys(eventsByDateNew);
      const eventCounts = Object.fromEntries(
        eventDates.map(date => [date, eventsByDateNew[date].length])
      );
      console.log('[PlannerWeek] eventsByDate recalculated', {
        dates: eventDates,
        counts: eventCounts,
        totalEvents: filtEvents.length
      });
    }

    return { 
      availByDate: availByDateNew, 
      eventsByDate: eventsByDateNew,
      patternDaysByDate: patternDaysByDateNew
    };
  }, [filtAvail, filtEvents, localEvents, weekHolidays]);
  
  // Compute version for force re-render - include date_local to catch day changes
  const eventsVersion = useMemo(() => {
    return filtEvents.map(e => `${e.id}:${e.start_ts}:${e.end_ts}:${e.date_local || ''}`).join('|');
  }, [filtEvents]);
  
  // Week key that changes when data changes
  const weekKey = useMemo(() => {
    const from = weekStart.toISOString().slice(0, 10);
    const to = addDays(weekStart, 7).toISOString().slice(0, 10);
    const childKey = selectedChildIds?.join(',') || 'all';
    const dataVersion = eventsData.length; // Include data length to force update when data changes
    return `${from}-${to}-${eventsVersion}-${childKey}-${dataVersion}`;
  }, [weekStart, eventsVersion, selectedChildIds, eventsData.length]);

  // Handle mouse-based drag start - MUST be before early return
  const handleMouseDragStart = useCallback((e, eventId) => {
    if (readOnly) return;
    if (typeof window === 'undefined') return;
    const mouseButton = typeof e.button === 'number' ? e.button : e.nativeEvent?.button;
    if (typeof mouseButton === 'number' && mouseButton !== 0) return; // Left click only when provided

    // Don't prevent default immediately - let the drag start naturally
    const startX = e.clientX;
    const startY = e.clientY;
    const originalTarget = e.currentTarget;
    pushDragDebug('mouse_down', {
      status: 'mouse_down',
      eventId,
      button: mouseButton ?? 'unknown',
      startX: Math.round(startX),
      startY: Math.round(startY),
    });
    
    // Reset drag flag
    isDraggingRef.current = false;
    
    // Store initial drag state (but don't update on every mouse move to avoid re-renders)
    setDragState({
      eventId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
    
    // Add global mouse move and up handlers
    const handleMouseMove = (moveEvent) => {
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      
      // Lower threshold to 3px for more responsive drag detection
      if (deltaX > 3 || deltaY > 3) {
        if (!isDraggingRef.current) {
          moveEvent.preventDefault();
          moveEvent.stopPropagation();
          console.log('[PlannerWeek] Drag detected! deltaX:', deltaX, 'deltaY:', deltaY);
          pushDragDebug('drag_detected', {
            status: 'dragging',
            eventId,
            deltaX: Math.round(deltaX),
            deltaY: Math.round(deltaY),
          });
          isDraggingRef.current = true;
          setDraggedEventId(eventId);
          dragRef.current = originalTarget;
          
          // Create drag ghost using direct DOM manipulation (like MonthGrid) for smooth performance
          let domNode = originalTarget;
          if (domNode._nativeNode) {
            domNode = domNode._nativeNode;
          }
          if (domNode && domNode.firstChild) {
            const actualElement = domNode.firstChild || domNode;
            if (actualElement.style) {
              domNode = actualElement;
            }
          }
          
          if (domNode && domNode.style) {
            // Store original position and styles
            const originalRect = domNode.getBoundingClientRect();
            originalTarget._originalTop = domNode.style.top;
            originalTarget._originalOpacity = domNode.style.opacity;
            originalTarget._originalTransform = domNode.style.transform;
            
            // Make original element semi-transparent during drag
            domNode.style.opacity = '0.4';
            domNode.style.transition = 'none';
            
            // Clone the element and append to body to avoid clipping
            const clonedNode = domNode.cloneNode(true);
            clonedNode.id = `drag-ghost-${eventId}`;
            clonedNode.style.position = 'fixed';
            clonedNode.style.pointerEvents = 'none';
            clonedNode.style.opacity = '0.9';
            clonedNode.style.transform = 'scale(1.05)';
            clonedNode.style.zIndex = '99999';
            clonedNode.style.cursor = 'grabbing';
            clonedNode.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
            clonedNode.style.width = domNode.offsetWidth + 'px';
            clonedNode.style.height = domNode.offsetHeight + 'px';
            
            // Position it at the mouse cursor (center it on cursor)
            clonedNode.style.left = (moveEvent.clientX - originalRect.width / 2) + 'px';
            clonedNode.style.top = (moveEvent.clientY - originalRect.height / 2) + 'px';
            
            // Append to body
            document.body.appendChild(clonedNode);
            
            // Store references
            originalTarget._dragDomNode = domNode;
            originalTarget._dragGhost = clonedNode;
          }
        }
      }
      
      // Update drag ghost position directly (no React re-render)
      if (isDraggingRef.current && originalTarget && originalTarget._dragGhost) {
        const ghost = originalTarget._dragGhost;
        const rect = ghost.getBoundingClientRect();
        ghost.style.left = (moveEvent.clientX - rect.width / 2) + 'px';
        ghost.style.top = (moveEvent.clientY - rect.height / 2) + 'px';
      }
      if (isDraggingRef.current) {
        const now = Date.now();
        if (now - lastMoveDebugAtRef.current > 250) {
          lastMoveDebugAtRef.current = now;
          const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const hoverDate = elementBelow?.closest?.('[data-day-date]')?.getAttribute?.('data-day-date') || null;
          pushDragDebug('drag_move', {
            status: 'dragging',
            eventId,
            x: Math.round(moveEvent.clientX),
            y: Math.round(moveEvent.clientY),
            hoverTag: elementBelow?.tagName || null,
            hoverDate,
          });
        }
      }
    };
    
    const handleMouseUp = async (upEvent) => {
      console.log('[PlannerWeek] handleMouseUp called', { wasDragging: isDraggingRef.current, eventId });
      pushDragDebug('mouse_up', {
        status: isDraggingRef.current ? 'drop_pending' : 'click_release',
        eventId,
        x: Math.round(upEvent.clientX),
        y: Math.round(upEvent.clientY),
        wasDragging: !!isDraggingRef.current,
      });
      
      // Find which day column we're over
      const elementBelow = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      console.log('[PlannerWeek] elementBelow', { 
        found: !!elementBelow, 
        tagName: elementBelow?.tagName,
        className: elementBelow?.className 
      });
      
      if (!elementBelow) {
        console.log('[PlannerWeek] No element below, cleaning up');
        pushDragDebug('drop_cancelled_no_element', {
          status: 'drop_failed',
          eventId,
          error: 'No element under cursor',
        });
        setDragState(null);
        setDraggedEventId(null);
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }
      
      // Find the day column - calculate based on position since data attributes might not work
      let dayColumn = null;
      let targetDateIso = null;
      let targetDetectionMethod = 'none';
      
      // Method 1: Try to find by data attribute (if it exists)
      dayColumn = elementBelow.closest('[data-day-date]');
      if (dayColumn) {
        targetDateIso = dayColumn.getAttribute('data-day-date');
        targetDetectionMethod = 'closest';
      }
      
      // Method 2: If not found, search up the tree for data attribute
      if (!dayColumn) {
        let parent = elementBelow.parentElement;
        let depth = 0;
        while (parent && parent !== document.body && depth < 15) {
          if (parent.getAttribute && parent.getAttribute('data-day-date')) {
            dayColumn = parent;
            targetDateIso = parent.getAttribute('data-day-date');
            targetDetectionMethod = 'ancestor';
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
      
      // Method 3: Calculate which day column based on mouse position
      if (!dayColumn || !targetDateIso) {
        console.log('[PlannerWeek] Trying position-based detection', { 
          clientX: upEvent.clientX, 
          clientY: upEvent.clientY 
        });
        
        // Find the week grid container - look for the grid body container
        // The grid body should be a flex row container with day columns
        let weekContainer = null;
        
        // Try multiple ways to find the grid container
        let searchElement = elementBelow;
        let searchDepth = 0;
        while (searchElement && searchDepth < 20) {
          // Check if this element has flexDirection: row and contains multiple children
          const style = window.getComputedStyle(searchElement);
          if (style.display === 'flex' && style.flexDirection === 'row') {
            const children = Array.from(searchElement.children);
            // Day column container should have 7 children (one for each day)
            if (children.length >= 7) {
              weekContainer = searchElement;
              console.log('[PlannerWeek] Found week container', { 
                childrenCount: children.length,
                tagName: searchElement.tagName 
              });
              break;
            }
          }
          searchElement = searchElement.parentElement;
          searchDepth++;
        }
        
        if (weekContainer) {
          // Get all direct children (day columns) - skip the first one if it's the time column
          const children = Array.from(weekContainer.children);
          console.log('[PlannerWeek] Week container children', { count: children.length });
          
          // Find which child contains the mouse position
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const rect = child.getBoundingClientRect();
            if (upEvent.clientX >= rect.left && upEvent.clientX <= rect.right &&
                upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
              dayColumn = child;
              
              // Calculate which day index this is
              // If first child is time column, day columns start at index 1
              // Otherwise they start at index 0
              const dayIndex = i >= 1 ? i - 1 : i; // Assume first is time column
              if (dayIndex >= 0 && dayIndex < 7) {
                // Calculate date from weekStart + dayIndex
                const targetDate = new Date(weekStart);
                targetDate.setDate(targetDate.getDate() + dayIndex);
                targetDateIso = getLocalDateString(targetDate);
                targetDetectionMethod = 'position';
                console.log('[PlannerWeek] Found day column by position', { 
                  childIndex: i,
                  dayIndex, 
                  targetDateIso, 
                  weekStart: weekStart.toISOString(),
                  rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
                });
              }
              break;
            }
          }
        } else {
          console.log('[PlannerWeek] Could not find week container', { searchDepth });
        }
      }
      
      console.log('[PlannerWeek] dayColumn search result', { 
        found: !!dayColumn,
        targetDateIso,
        tagName: dayColumn?.tagName
      });
      pushDragDebug('drop_target_resolved', {
        status: dayColumn && targetDateIso ? 'drop_target_found' : 'drop_target_missing',
        eventId,
        targetDateIso: targetDateIso || null,
        detection: targetDetectionMethod,
        found: !!dayColumn,
      });
      
      if (dayColumn && targetDateIso) {
        console.log('[PlannerWeek] Found day column', { targetDateIso, eventId });

        // Mark that we're rescheduling so cleanup doesn't restore the element too early
        if (originalTarget) {
          originalTarget._willReschedule = true;
        }

        // Find the event being dragged
        // Filter events based on selected children
        const eventsData = Array.isArray(data.events) ? data.events : [];
        const ids = selectedChildIds?.length ? new Set(selectedChildIds) : null;
        const allEvents = ids
          ? eventsData.filter(e => ids.has(e.child_id))
          : eventsData;
        const event = allEvents.find(ev => ev.id === eventId);
        
        console.log('[PlannerWeek] Event lookup', { 
          foundEvent: !!event, 
          totalEvents: allEvents.length,
          eventTitle: event?.title 
        });
        
        if (event && targetDateIso) {
          // Get original event times
          const originalStart = new Date(event.start_ts);
          const originalEnd = new Date(event.end_ts);
          const durationMs = originalEnd.getTime() - originalStart.getTime();
          
          // Calculate time change from vertical drag (Y position) FIRST
          // We need this before creating the date
          const dayColumnRect = dayColumn.getBoundingClientRect();
          const relativeY = upEvent.clientY - dayColumnRect.top;
          const dayColumnHeight = dayColumnRect.height;
          
          // Calculate time based on Y position (assuming 7 AM to 6 PM = 11 hours = 660 minutes)
          const hoursStart = 7; // 7 AM
          const hoursEnd = 18; // 6 PM
          const totalMinutes = (hoursEnd - hoursStart) * 60; // 660 minutes
          
          // Calculate minutes from top of day column
          const minutesFromTop = (relativeY / dayColumnHeight) * totalMinutes;
          const newMinutes = Math.max(0, Math.min(totalMinutes, minutesFromTop));
          
          // Snap to 15-minute increments
          const snappedMinutes = Math.round(newMinutes / 15) * 15;
          const newHours = hoursStart + Math.floor(snappedMinutes / 60);
          const newMins = snappedMinutes % 60;
          
          // Check if we're moving to a different day or just changing time
          const originalDateIso = getLocalDateString(originalStart);
          const isSameDay = targetDateIso === originalDateIso;
          
          // Get drag start position from closure (captured at start in handleMouseDragStart)
          // Use the startX and startY from the closure, not from dragState (which might be stale)
          const dragStartX = startX;
          const dragStartY = startY;
          const deltaX = Math.abs(upEvent.clientX - dragStartX);
          const deltaY = Math.abs(upEvent.clientY - dragStartY);
          
          console.log('[PlannerWeek] Time calculation', {
            relativeY,
            dayColumnHeight,
            minutesFromTop,
            snappedMinutes,
            newHours,
            newMins,
            calculatedTime: `${newHours}:${String(newMins).padStart(2, '0')}`,
            isSameDay,
            deltaY,
            deltaX
          });
          
          // Determine what time to use
          let finalHours, finalMinutes;
          if (isSameDay) {
            // Same day - always use calculated time based on Y position
            // If they're dragging within the same day, they clearly want to change the time
            // Only require 1px of movement to make it very responsive
            if (deltaY > 1) {
              finalHours = newHours;
              finalMinutes = newMins;
              console.log('[PlannerWeek] Same-day drag: Using calculated time', {
                deltaY,
                originalTime: `${originalStart.getHours()}:${String(originalStart.getMinutes()).padStart(2, '0')}`,
                calculatedTime: `${newHours}:${String(newMins).padStart(2, '0')}`,
                finalTime: `${finalHours}:${String(finalMinutes).padStart(2, '0')}`
              });
            } else {
              // No vertical movement - keep original time (shouldn't happen if drag was detected)
              finalHours = originalStart.getHours();
              finalMinutes = originalStart.getMinutes();
              console.log('[PlannerWeek] Same-day drag: No vertical movement, keeping original time', {
                deltaY,
                originalTime: `${originalStart.getHours()}:${String(originalStart.getMinutes()).padStart(2, '0')}`
              });
            }
          } else {
            // Different day - preserve original time unless it's a significant vertical drag
            if (deltaY > deltaX && deltaY > 15) {
              // Significant vertical movement - use calculated time
              finalHours = newHours;
              finalMinutes = newMins;
            } else {
              // Horizontal drag (day change) - preserve original time
              finalHours = originalStart.getHours();
              finalMinutes = originalStart.getMinutes();
            }
          }
          
          // Create new date using explicit local time components (like MonthGrid does)
          // This ensures the date is created in the local timezone correctly
          const [year, month, day] = targetDateIso.split('-').map(Number);
          const newStart = new Date(year, month - 1, day, finalHours, finalMinutes, 0, 0);
          
          console.log('[PlannerWeek] Date creation', {
            targetDateIso,
            finalHours,
            finalMinutes,
            newStartISO: newStart.toISOString(),
            newStartLocal: `${newStart.getHours()}:${String(newStart.getMinutes()).padStart(2, '0')}`,
            originalStartISO: originalStart.toISOString(),
            originalStartLocal: `${originalStart.getHours()}:${String(originalStart.getMinutes()).padStart(2, '0')}`
          });
          
          if (isNaN(newStart.getTime())) {
            console.error('[PlannerWeek] Invalid destination date:', targetDateIso);
            return;
          }
          
          // Compute new end time: add original duration
          const newEnd = new Date(newStart.getTime() + durationMs);
          
          // Optimistic update - apply IMMEDIATELY before cleanup to prevent visual jump
          // Use targetDateIso directly for date_local to ensure it matches what the user dragged to
          // This prevents date mismatches that cause visual jumps
          const optimisticEvent = {
            ...event,
            start_ts: newStart.toISOString(),
            end_ts: newEnd.toISOString(),
            date_local: targetDateIso, // Use targetDateIso directly - this is what user dragged to
          };
          console.log('[PlannerWeek] Creating optimistic update', {
            eventId,
            targetDateIso,
            optimisticDateLocal: optimisticEvent.date_local,
            originalDateLocal: event.date_local,
            newStart: newStart.toISOString(),
            isSameDay,
            deltaY,
            deltaX,
            originalTime: `${originalStart.getHours()}:${originalStart.getMinutes()}`,
            newTime: `${newStart.getHours()}:${newStart.getMinutes()}`,
            calculatedTime: `${newHours}:${newMins}`,
            relativeY,
            dayColumnHeight
          });
          
          // Remove drag ghost immediately for instant snap-in feel
          // This makes the event appear in the new position right away
          if (originalTarget && originalTarget._dragGhost) {
            const ghost = originalTarget._dragGhost;
            if (ghost.parentNode) {
              ghost.parentNode.removeChild(ghost);
            }
            delete originalTarget._dragGhost;
          }
          
          // Restore original element's opacity before optimistic update
          if (originalTarget && originalTarget._dragDomNode && originalTarget._originalOpacity !== undefined) {
            originalTarget._dragDomNode.style.opacity = originalTarget._originalOpacity || '';
            originalTarget._dragDomNode.style.transition = '';
            delete originalTarget._originalOpacity;
            delete originalTarget._originalTop;
            delete originalTarget._originalTransform;
          }
          
          // Apply optimistic update immediately
          setLocalEvents(prev => ({ ...prev, [eventId]: optimisticEvent }));
          
          // Don't hide the original element - let React handle the re-render naturally
          // The optimistic update will cause React to render the event in the new position
          // We'll keep the optimistic update until fresh data confirms the change
          // This prevents any visual jump
          
          // Call API to reschedule with offline support
          console.log('[PlannerWeek] Calling rescheduleEvent', {
            eventId,
            newStart: newStart.toISOString(),
            newEnd: newEnd.toISOString(),
            isSameDay,
            originalStart: originalStart.toISOString(),
            originalEnd: originalEnd.toISOString()
          });
          
          try {
            pushDragDebug('api_reschedule_start', {
              status: 'api_pending',
              eventId,
              targetDateIso,
              startTs: newStart.toISOString(),
              endTs: newEnd.toISOString(),
            });
            const { data: updatedEvent, error } = await rescheduleEvent(
              eventId,
              newStart.toISOString(),
              newEnd.toISOString(),
              'drag_drop',
              isSameDay ? 'time change' : 'day move',
              familyId
            );
            
            console.log('[PlannerWeek] rescheduleEvent response', { 
              success: !error, 
              error: error?.message,
              updatedEvent: !!updatedEvent 
            });
            
            if (error) {
              // Revert optimistic update on error
              console.error('[PlannerWeek] Reschedule error', error);
              pushDragDebug('api_reschedule_error', {
                status: 'api_error',
                eventId,
                targetDateIso,
                error: error.message || 'unknown_error',
              });
              setLocalEvents(prev => {
                const next = { ...prev };
                delete next[eventId];
                return next;
              });
              Alert.alert('Error', `Failed to reschedule event: ${error.message || 'Unknown error'}`);
              // Trigger refresh event to reload data
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
              }
            } else {
              // Success - keep optimistic update until refresh completes
              console.log('[PlannerWeek] Reschedule successful');
              pushDragDebug('api_reschedule_success', {
                status: 'api_success',
                eventId,
                targetDateIso,
                hasUpdatedEvent: !!updatedEvent,
              });
              // Don't overwrite optimistic update with server response - it might have old date_local
              // The optimistic update already has the correct date_local (targetDateIso)
              // We'll keep it until fresh data arrives from the refresh
              // This ensures the event stays in the correct day column
              // Trigger refresh event to reload data from server
              // The refresh will replace the optimistic update with fresh data
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
                // Also refresh calendar data for month view and other views
                if (window.__refreshCalendarData) {
                  // Refresh the month containing the event's new date
                  const eventDate = new Date(newStart);
                  window.__refreshCalendarData(eventDate).catch(err => {
                    console.error('[PlannerWeek] Calendar refresh failed:', err);
                  });
                }
                // Dispatch event for other components to refresh
                window.dispatchEvent(new CustomEvent('eventRescheduled', {
                  detail: { eventId, newStart, newEnd }
                }));
              }
            }
          } catch (err) {
            // Revert optimistic update on exception
            console.error('[PlannerWeek] Reschedule exception', err);
            pushDragDebug('api_reschedule_exception', {
              status: 'api_exception',
              eventId,
              targetDateIso,
              error: err.message || 'unknown_exception',
            });
            setLocalEvents(prev => {
              const next = { ...prev };
              delete next[eventId];
              return next;
            });
            Alert.alert('Error', `Failed to reschedule event: ${err.message || 'Unknown error'}`);
            // Trigger refresh event to reload data
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
            }
          }
        }
      }
      
      // Clean up
      const wasDragging = isDraggingRef.current;
      
      // Clean up drag ghost (direct DOM manipulation)
      // Note: Ghost may have already been removed when optimistic update was applied
      // This is a safety cleanup in case the drag was cancelled or failed
      if (originalTarget) {
        if (originalTarget._dragGhost && originalTarget._dragGhost.parentNode) {
          originalTarget._dragGhost.parentNode.removeChild(originalTarget._dragGhost);
          delete originalTarget._dragGhost;
        }
        
        // Restore original element's opacity if we changed it
        if (originalTarget._dragDomNode && originalTarget._originalOpacity !== undefined) {
          originalTarget._dragDomNode.style.opacity = originalTarget._originalOpacity || '';
          originalTarget._dragDomNode.style.transition = '';
          delete originalTarget._originalOpacity;
          delete originalTarget._originalTop;
          delete originalTarget._originalTransform;
        }
      }
      
      setDragState(null);
      setDraggedEventId(null);
      dragRef.current = null;
      isDraggingRef.current = false;
      pushDragDebug('drag_cleanup', {
        status: wasDragging ? 'idle_after_drop' : 'idle_after_click',
        eventId,
        wasDragging,
      });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // If we didn't actually drag, allow click to proceed
      if (!wasDragging) {
        // Small delay to allow click handler to check isDraggingRef
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 10);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, data.events, selectedChildIds, weekStart, handleWeekStartChange, familyId, pushDragDebug]);

  // Always render week view with current data (no loading screen); data updates in place when refetches complete
  return (
    <View style={[
      styles.wrapper,
      typeof window !== 'undefined' && {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }
    ]}>
        {/* Save Template Modal */}
        <SaveTemplateModal
          isOpen={showSaveTemplateModal}
          onClose={() => setShowSaveTemplateModal(false)}
          selectedChildren={selectedChildIds || []}
          dateRange={{
            start: getLocalDateString(getWeekStart(weekStart)),
            end: getLocalDateString(addDays(getWeekStart(weekStart), 6)),
          }}
          familyId={familyId}
        />

        {/* Constraints Timeline - Shows weekly constraint status */}
        {/* TODO: Add ConstraintsProvider wrapper if ConstraintsTimeline is needed */}
        {/* <ConstraintsTimeline
          weekStart={weekStart}
          childIds={selectedChildIds}
          familyId={familyId}
          onDayClick={(date, constraint) => {
            // Optional: Handle day click (e.g., open adjustment modal)
          }}
        /> */}

        {/* Week Grid - Fills available space like month grid */}
        <View style={[styles.weekGridContainer, isWeekFrozen && styles.weekGridContainerFrozen]}>
          <View style={styles.grid}>
            {/* Header Row - Single row with day name and number on same line */}
            <View style={styles.gridHeader}>
              <View style={styles.timeColumn} />
              {days.map((d, i) => {
                const dateIso = getLocalDateString(d);
                const patternDay = patternDaysByDate[dateIso];
                return (
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
                    {patternDay && (
                      <View style={styles.patternDayBadge}>
                        <Text style={styles.patternDayText}>{patternDay}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
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
              scrollEnabled={!draggedEventId} // Disable scroll while dragging
              {...(typeof window === 'undefined' ? {
                contentOffset: initialScrollOffset,
              } : typeof window !== 'undefined' ? {
                onWheel: draggedEventId ? (e) => e.preventDefault() : undefined, // Prevent scroll during drag
                onDragOver: (e) => {
                  // Allow drag events to pass through ScrollView
                  e.preventDefault();
                },
              } : {})}
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
                    <View 
                      key={i} 
                      style={styles.timeLabelContainer}
                    >
                      <Text style={styles.timeLabel}>
                        {hour12}:{mm} {period}
                      </Text>
                    </View>
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
                    familyId={familyId}
                    onAdd={readOnly ? undefined : (startMin) => {
                      onAddActivity?.({ date: iso, startMin });
                    }}
                    onEventChanged={handleEventChanged}
                    onEventClick={handleEventClick}
                    onMouseDragStart={readOnly ? undefined : handleMouseDragStart}
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
        familyId={familyId}
        children={data?.children || []}
        familyMembers={data?.children || []}
      />

      {/* Note Editor Modal */}
      <NoteEditorModal
        visible={showNoteEditor}
        onClose={() => {
          setShowNoteEditor(false);
          setNoteEditorProps({ linkedEventId: null, defaultChildId: null, defaultText: '' });
        }}
        onSaved={() => {
          setShowNoteEditor(false);
          setNoteEditorProps({ linkedEventId: null, defaultChildId: null, defaultText: '' });
          // Refresh week data to show updated note counts
          handleWeekStartChange(new Date(weekStart));
        }}
        familyId={familyId}
        linkedEventId={noteEditorProps.linkedEventId}
        defaultChildId={noteEditorProps.defaultChildId}
        defaultText={noteEditorProps.defaultText}
        children={data?.children || []}
        availableEvents={data?.events || []}
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
}
              }
            }
          } catch (err) {
            // RPC might not exist, that's okay
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

      {/* Weekly Reshuffle Modal */}
      <WeeklyReshuffleModal
        visible={showWeeklyReshuffle}
        onClose={() => setShowWeeklyReshuffle(false)}
        familyId={familyId}
        childIds={selectedChildIds}
        weekStart={weekStart}
        onApply={() => {
          // Force refresh
          handleWeekStartChange((() => {
            const newDate = new Date(weekStart);
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
    </View>
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
  weekHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveTemplateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  saveTemplateButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
  },
  saveTemplateButtonTextDisabled: {
    color: colors.muted,
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
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 1,
    }),
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
    fontWeight: '400',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  dayHeaderDate: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
  },
  dayHeaderDateOtherMonth: {
    color: '#d1d5db',
  },
  patternDayBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.primarySoft || '#e3f2fd',
    borderRadius: 4,
    alignSelf: 'center',
  },
  patternDayText: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.primary,
    textTransform: 'uppercase',
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
  timeLabelContainer: {
    marginBottom: 52,
    paddingLeft: 4,
  },
  timeLabel: {
    fontSize: 10,
    color: colors.muted,
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
    paddingHorizontal: 4, // Equal padding on both sides
    paddingVertical: 0,
    ...(Platform.OS === 'web' && {
      overflow: 'visible', // Allow rounded corners to show
      boxSizing: 'border-box',
    }),
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

