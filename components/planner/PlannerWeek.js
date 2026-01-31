import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Calendar, Sparkles, List, Lock, Unlock, Printer, AlertCircle } from 'lucide-react';
// Using native HTML5 drag-and-drop instead of @hello-pangea/dnd for React Native Web compatibility
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import DraggableEvent from './DraggableEvent';
// Re-enabling step by step
import EventModal from '../events/EventModal';
import RescheduleReportModal from './RescheduleReportModal';
import BlackoutDialog from './BlackoutDialog';
import RescheduleModal from './RescheduleModal';
import BulkRescheduleModal from './BulkRescheduleModal';
import WeeklyReshuffleModal from './WeeklyReshuffleModal';
import { proposeReschedule, getWeekStart, freezeWeek, getWeeklyPacket } from '../../lib/apiClient';
import { rescheduleEvent, createEvent as createEventWithOffline, deleteEvent as deleteEventWithOffline } from '../../lib/services/plannerClientWithOffline';
import * as offlineStorage from '../../lib/services/offlineStorage';
import PlanYearWizard from '../year/PlanYearWizard';
import SaveTemplateModal from '../templates/SaveTemplateModal';
import { Save } from 'lucide-react';
// ConstraintsTimeline requires ConstraintsProvider - making it optional
// import ConstraintsTimeline from '../../app/components/schedule/ConstraintsTimeline';
import { logDragDrop, logDeleteEvent } from '../../app/services/plannerInstrumentation';
import NoteEditorModal from '../records/NoteEditorModal';

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

// Time grid constants and pixel→minutes converter
const GRID_MINUTES = 24 * 60; // 1440 minutes in a day
const SNAP_MINUTES = 15; // Snap to 15-minute increments

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function snapMinutes(min, step = SNAP_MINUTES) {
  return Math.round(min / step) * step;
}

function minutesFromY(yPx, gridHeightPx) {
  if (!gridHeightPx || gridHeightPx <= 0) return 0;
  const ratio = clamp(yPx / gridHeightPx, 0, 1);
  return ratio * GRID_MINUTES;
}

// Format conflict message from validation conflicts array
function formatConflictMessage(conflicts, children = []) {
  if (!conflicts || !Array.isArray(conflicts) || conflicts.length === 0) {
    return 'This time slot conflicts with other events';
  }
  
  const firstConflict = conflicts[0];
  const conflictTitle = firstConflict.title || 'Event';
  
  // Get child name(s) from child_ids
  let childNames = [];
  if (firstConflict.child_ids && Array.isArray(firstConflict.child_ids)) {
    childNames = firstConflict.child_ids
      .map(childId => {
        const child = children.find(c => c.id === childId);
        return child ? (child.first_name || child.name) : null;
      })
      .filter(Boolean);
  }
  const childNameStr = childNames.length > 0 ? ` (${childNames.join(', ')})` : '';
  
  // Format time range
  let timeStr = '';
  if (firstConflict.start_ts && firstConflict.end_ts) {
    try {
      const start = new Date(firstConflict.start_ts);
      const end = new Date(firstConflict.end_ts);
      const startHour = start.getHours();
      const startMin = start.getMinutes();
      const endHour = end.getHours();
      const endMin = end.getMinutes();
      
      const formatTime = (h, m) => {
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const period = h >= 12 ? 'PM' : 'AM';
        const mm = m.toString().padStart(2, '0');
        return `${hour12}:${mm} ${period}`;
      };
      
      timeStr = ` ${formatTime(startHour, startMin)}–${formatTime(endHour, endMin)}`;
    } catch (e) {
      // Fallback if date parsing fails
    }
  }
  
  return `Conflicts with ${conflictTitle}${childNameStr}${timeStr}`;
}

// Import offline-enabled week data hook
import { useWeekDataWithOffline } from './useWeekDataWithOffline';

// Custom hook for week data (keeping original for backward compatibility, but using offline version)
function useWeekData(weekStart, childIds, familyId) {
  return useWeekDataWithOffline(weekStart, childIds, familyId);
}

// Day Column Component
function DayColumn({ date, dateIso, hours, windows, events, onAdd, onEventChanged, onEventClick, dayStatus, children = [], focusedChildId = null, draggedEventId = null, onMouseDragStart = null, familyId = null, schedulingAssistantEnabled = false, busyBlocks = [], dragPreview = null, commitAnimation = null }) {
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
  // Use View instead of div to avoid React Native Web property setting issues
  const ColumnWrapper = View;
  
  return (
    <ColumnWrapper 
      data-day-date={dateIso || getLocalDateString(date)}
      style={[
        styles.dayColumn,
        isBlackout && styles.dayColumnBlackout,
        isPartialBlackout && styles.dayColumnPartialBlackout
      ]}
    >{/* Hour lines */}{Array.from({ length: Math.floor(total / step) + 1 }).map((_, i) => {
              const y = (i * step / total) * 100;
              const LineWrapper = View;
              return (
                <LineWrapper
                  key={i}
                  style={[styles.hourLine, { top: `${y}%` }]}
                />
              );
            })}{/* Availability windows - only show if not full blackout */}
            {!isBlackout && windows
              .filter(w => w && w.start && w.end) // Filter out invalid windows
              .map((w, idx) => {
                const s = ((minutesSinceMidnight(w.start) - hours.startMin) / total) * 100;
                const e = ((minutesSinceMidnight(w.end) - hours.startMin) / total) * 100;
                const h = Math.max(2, e - s);
                const WindowWrapper = View;
                return (
                  <WindowWrapper
                    key={idx}
                    style={[
                      styles.availWindow,
                      { top: `${s}%`, height: `${h}%` }
                    ]}
                  />
                );
              })}{/* Blackout indicator overlay - full blackout */}
            {isBlackout && (
              <View style={styles.blackoutOverlay}>
                <Text style={styles.blackoutText}>No Availability</Text>
              </View>
            )}{/* Partial blackout indicator - some children off */}
            {isPartialBlackout && (
              <View style={styles.partialBlackoutOverlay}>
                <Text style={styles.partialBlackoutText}>Partial Availability</Text>
              </View>
            )}{/* Scheduling Assistant: Busy blocks overlay */}
            {schedulingAssistantEnabled && busyBlocks && busyBlocks.length > 0 && busyBlocks
              .filter(block => {
                // Filter blocks for this day
                const blockStart = new Date(block.start_ts);
                const blockEnd = new Date(block.end_ts);
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);
                return blockStart < dayEnd && blockEnd > dayStart;
              })
              .map((block, idx) => {
                const blockStart = new Date(block.start_ts);
                const blockEnd = new Date(block.end_ts);
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);

                // Clamp block to day boundaries (fixes cross-day spans)
                const startClamped = new Date(Math.max(blockStart.getTime(), dayStart.getTime()));
                const endClamped = new Date(Math.min(blockEnd.getTime(), dayEnd.getTime()));

                let startMin = (startClamped.getTime() - dayStart.getTime()) / 60000;
                let endMin = (endClamped.getTime() - dayStart.getTime()) / 60000;
                
                // Clamp to [0, 1440] minute range
                startMin = clamp(startMin, 0, GRID_MINUTES);
                endMin = clamp(endMin, 0, GRID_MINUTES);
                
                const s = ((startMin - hours.startMin) / total) * 100;
                const e = ((endMin - hours.startMin) / total) * 100;
                const h = Math.max(1, e - s);
                
                const BlockWrapper = View;
                return (
                  <BlockWrapper
                    key={`busy-${block.event_id}-${idx}`}
                    style={[
                      styles.busyBlock,
                      { top: `${Math.max(0, s)}%`, height: `${h}%` }
                    ]}
                    title={block.title}
                  />
                );
              })}

            {/* Drag ghost block - shows preview during drag or commit animation */}
            {((dragPreview?.eventId && dragPreview.dayIso === (dateIso || getLocalDateString(date))) ||
              (commitAnimation?.eventId && commitAnimation.dayIso === (dateIso || getLocalDateString(date)))) && (
              <View
                pointerEvents="none"
                style={[
                  styles.dragGhost,
                  commitAnimation ? styles.dragGhostCommitting : null,
                  {
                    top: `${(((commitAnimation || dragPreview).startMin - hours.startMin) / total) * 100}%`,
                    height: `${(((commitAnimation || dragPreview).endMin - (commitAnimation || dragPreview).startMin) / total) * 100}%`,
                    borderColor: commitAnimation 
                      ? 'rgba(34,197,94,0.8)' // Green for successful commit
                      : (dragPreview?.ok ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.8)'),
                    backgroundColor: commitAnimation
                      ? 'rgba(34,197,94,0.15)' // Green for successful commit
                      : (dragPreview?.ok ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)'),
                  },
                ]}
              >
                {/* Collision icon for invalid preview */}
                {dragPreview && !dragPreview.ok && !commitAnimation && typeof window !== 'undefined' && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    pointerEvents: 'none',
                  }}>
                    <AlertCircle size={16} color="rgba(239,68,68,0.9)" />
                  </div>
                )}
              </View>
            )}{/* Events - Now Draggable with native HTML5 */}
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
                      familyId={familyId}
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
                    familyId={familyId}
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
  const [showBulkRescheduleModal, setShowBulkRescheduleModal] = useState(false);
  const [reschedulePlan, setReschedulePlan] = useState(null);
  const [showWeeklyReshuffle, setShowWeeklyReshuffle] = useState(false);
  const [schedulingAssistantEnabled, setSchedulingAssistantEnabled] = useState(false);
  const [busyBlocks, setBusyBlocks] = useState([]);
  const [hasBlackout, setHasBlackout] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [loadingReschedule, setLoadingReschedule] = useState(false);
  const [hasScrolledTo7AM, setHasScrolledTo7AM] = useState(false);
  const [focusedChildId, setFocusedChildId] = useState(null); // For focus mode
  const [showYearWizard, setShowYearWizard] = useState(false);
  const initialScrollOffset = { x: 0, y: 420 }; // Start at 7 AM (7 hours * 60px)
  const [draggedEventId, setDraggedEventId] = useState(null); // Track which event is being dragged
  const [dragState, setDragState] = useState(null); // { eventId, startX, startY, currentX, currentY }
  const [dragPreview, setDragPreview] = useState(null); // { eventId, dayIso, startMin, endMin, conflicts?: [], ok?: boolean }
  const dragPreviewRef = useRef(null); // Ref to store latest preview for closure access
  const dragRef = useRef(null); // Ref to track drag element
  const gridBodyRef = useRef(null); // Ref to grid body container for measuring
  const [gridRect, setGridRect] = useState(null); // { top, height } - grid container bounding rect
  const gridRectRef = useRef(null); // Ref to store latest gridRect for closure access
  const validateTimerRef = useRef(null); // Timer for debounced validation
  const filtEventsRef = useRef([]); // Ref to store latest filtEvents for closure access
  const [commitAnimation, setCommitAnimation] = useState(null); // { eventId, dayIso, startMin, endMin, finalTop, finalHeight } for commit animation
  const [isWeekFrozen, setIsWeekFrozen] = useState(false); // Track if current week is frozen
  const [freezeLoading, setFreezeLoading] = useState(false); // Loading state for freeze toggle
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteEditorProps, setNoteEditorProps] = useState({
    linkedEventId: null,
    defaultChildId: null,
    defaultText: '',
  });
  
  const { data, loading } = useWeekData(weekStart, selectedChildIds, familyId);

  // Filter events and availability by selected children (must be defined early for use in callbacks)
  // Create new arrays and objects to avoid mutating frozen objects from the hook
  const availData = Array.isArray(data?.avail) 
    ? data.avail.map(a => a ? { ...a } : a).filter(Boolean)
    : [];
  const eventsData = Array.isArray(data?.events)
    ? data.events.map(e => e ? { ...e } : e).filter(Boolean)
    : [];
  const ids = selectedChildIds?.length ? new Set(selectedChildIds) : null;
  const filtAvail = ids && Array.isArray(availData)
    ? availData.filter(a => a && a.child_id && ids.has(a.child_id))
    : (Array.isArray(availData) ? availData : []);
  const filtEvents = ids && Array.isArray(eventsData)
    ? eventsData.filter(e => e && e.child_id && ids.has(e.child_id))
    : (Array.isArray(eventsData) ? eventsData : []);
  
  // Update refs whenever values change (defensive checks to avoid uninitialized variable errors)
  useEffect(() => {
    try {
      if (filtEventsRef) {
        filtEventsRef.current = Array.isArray(filtEvents) ? filtEvents : [];
      }
    } catch (e) {
      // Ignore errors during ref update
    }
  }, [filtEvents]);
  
  useEffect(() => {
    try {
      if (gridRectRef) {
        gridRectRef.current = gridRect;
      }
    } catch (e) {
      // Ignore errors during ref update
    }
  }, [gridRect]);

  // Cursor feedback on invalid preview
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (dragPreview && !dragPreview.ok) {
      document.body.style.cursor = 'not-allowed';
      // Also set cursor on the grid body
      const gridEl = document.getElementById('planner-week-grid-body');
      if (gridEl) {
        gridEl.style.cursor = 'not-allowed';
      }
    } else {
      document.body.style.cursor = '';
      const gridEl = document.getElementById('planner-week-grid-body');
      if (gridEl) {
        gridEl.style.cursor = '';
      }
    }
    
    return () => {
      document.body.style.cursor = '';
      const gridEl = document.getElementById('planner-week-grid-body');
      if (gridEl) {
        gridEl.style.cursor = '';
      }
    };
  }, [dragPreview]);

  // Load busy blocks when Scheduling Assistant is enabled
  useEffect(() => {
    if (!schedulingAssistantEnabled || !familyId) {
      setBusyBlocks([]);
      return;
    }

    (async () => {
      const weekEnd = addDays(weekStart, 7);
      const { data: fbData, error } = await supabase.rpc('get_freebusy_week', {
        _family_id: familyId,
        _from: weekStart.toISOString(),
        _to: weekEnd.toISOString(),
        _child_ids: selectedChildIds && selectedChildIds.length > 0 ? selectedChildIds : null,
      });

      if (error) {
        console.error('Failed to load busy blocks:', error);
        setBusyBlocks([]);
      } else {
        setBusyBlocks(fbData?.busy || []);
      }
    })();
  }, [schedulingAssistantEnabled, familyId, weekStart, selectedChildIds]);

  // Memoize formatted month/year to prevent unnecessary recalculations
  const monthYearText = useMemo(() => {
    return weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [weekStart.getFullYear(), weekStart.getMonth()]);

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
    const allEvents = filtEvents;
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
        // Success - update local state with server response
        if (updatedEvent) {
          setLocalEvents(prev => ({ ...prev, [eventId]: updatedEvent }));
        }
        
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
      const isRecurringEvent = event.recurrence_rule || event.recurrence_id || event.parent_event_id;
      
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
        menuItems.push({ 
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
              
              handleEventDeleted(cleanEventId);
              // Trigger refresh
              handleWeekStartChange(new Date(weekStart));
            } catch (err) {
              console.error('[PlannerWeek] Delete error:', err);
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
      const deletedEvent = filtEvents.find(e => e.id === deletedEventId || e._originalId === deletedEventId);
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

  // Measure grid container for mouse Y calculation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let mounted = true;
    let timeoutId = null;
    let updateHandler = null;

    const update = () => {
      if (!mounted) return;
      try {
        const el = document.getElementById('planner-week-grid-body');
        if (!el || !mounted) return;
        const r = el.getBoundingClientRect();
        if (mounted && r.height > 0) {
          setGridRect({ top: r.top, height: r.height });
        }
      } catch (e) {
        // Ignore errors during measurement
      }
    };

    if (loading) {
      setGridRect(null);
      return;
    }

    // Wait for DOM to be ready
    let retryCount = 0;
    const maxRetries = 10;
    const attemptUpdate = () => {
      if (!mounted || retryCount >= maxRetries) return;
      const el = document.getElementById('planner-week-grid-body');
      if (el) {
        update();
        updateHandler = update;
        window.addEventListener('resize', updateHandler);
        window.addEventListener('scroll', updateHandler, true);
      } else {
        retryCount++;
        requestAnimationFrame(attemptUpdate);
      }
    };

    // Delay initial attempt to ensure DOM is ready
    timeoutId = setTimeout(attemptUpdate, 100);
    
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (updateHandler) {
        window.removeEventListener('resize', updateHandler);
        window.removeEventListener('scroll', updateHandler, true);
      }
    };
  }, [weekStart, loading]);
  
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

  // Index avail/events by date - ALWAYS create new objects (no mutation)
  // Note: filtAvail and filtEvents are now defined earlier in the component
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
      // Create a copy of the availability object to avoid mutating frozen objects
      const availItem = { ...a };
      const windows = availItem.windows;
      if (!availByDateNew[dateKey]) {
        availByDateNew[dateKey] = [];
      }
      
      if (Array.isArray(windows)) {
        // Empty array [] means blackout - don't add anything
        if (windows.length > 0) {
          // Create a new array with spread to avoid mutating frozen arrays
          // Also create copies of window objects if they're frozen
          const windowsCopy = windows.map(w => typeof w === 'object' && w !== null ? { ...w } : w);
          availByDateNew[dateKey] = [...availByDateNew[dateKey], ...windowsCopy];
        }
      } else if (windows && typeof windows === 'object') {
        // If it's a JSONB object, convert to array
        const windowsArray = Array.isArray(windows) 
          ? windows.map(w => typeof w === 'object' && w !== null ? { ...w } : w)
          : [{ ...windows }];
        if (windowsArray.length > 0) {
          // Create a new array with spread to avoid mutating frozen arrays
          availByDateNew[dateKey] = [...availByDateNew[dateKey], ...windowsArray];
        }
      } else if (windows === null || windows === undefined) {
        // No windows = blackout (skip adding)
      }
      // If windows is empty string '[]', no windows added (blackout)
    }
    
    // Process events
    for (const e of filtEvents) {
      // Use local optimistic update if available, or create a new object from the frozen event
      let event = localEvents[e.id] || { ...e };
      
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
      // Create a new array with spread to avoid mutating frozen arrays
      eventsByDateNew[d] = [...eventsByDateNew[d], event];
    }

    return { 
      availByDate: availByDateNew, 
      eventsByDate: eventsByDateNew,
      patternDaysByDate: patternDaysByDateNew
    };
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

  // Use div wrapper for web (drag-drop requires DOM)
  // Use View for React Native Web compatibility - it will render as div automatically
  const Wrapper = View;
  const wrapperStyle = styles.wrapper;
  
  // Handle mouse-based drag start
  const handleMouseDragStart = useCallback((e, eventId) => {
    if (typeof window === 'undefined') return;
    
    // Get filtEvents from ref (always up-to-date, no closure issues)
    const currentFiltEvents = filtEventsRef.current;
    
    // Ensure filtEvents is available
    if (!currentFiltEvents || !Array.isArray(currentFiltEvents)) return;

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
    
    // Capture current values for closure (use refs to avoid closure issues)
    // currentFiltEvents already captured above
    const currentGridRect = gridRectRef.current;
    const currentFamilyId = familyId;
    const currentWeekStart = weekStart;
    const currentSelectedChildIds = selectedChildIds;
    const currentSchedulingAssistantEnabled = schedulingAssistantEnabled;
    
    // Add global mouse move and up handlers
    const handleMouseMove = (moveEvent) => {
      setDragState(prev => prev ? {
        ...prev,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
      } : null);

      // Live preview only on web
      if (!currentGridRect || typeof currentGridRect.top !== 'number' || typeof currentGridRect.height !== 'number') return;

      const elBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const dayColumn = elBelow?.closest?.('[data-day-date]');
      const dayIso = dayColumn?.getAttribute?.('data-day-date');
      if (!dayIso) {
        dragPreviewRef.current = null;
        setDragPreview(null);
        return;
      }

      const event = currentFiltEvents.find(ev => ev.id === eventId);
      if (!event) {
        dragPreviewRef.current = null;
        setDragPreview(null);
        return;
      }

      const originalStart = new Date(event.start_ts);
      const originalEnd = new Date(event.end_ts);
      const durationMin = Math.max(5, Math.round((originalEnd.getTime() - originalStart.getTime()) / 60000));

      const yInside = moveEvent.clientY - currentGridRect.top;
      let startMin = minutesFromY(yInside, currentGridRect.height);
      startMin = snapMinutes(startMin, SNAP_MINUTES);
      startMin = clamp(startMin, 0, GRID_MINUTES - durationMin);

      const endMin = startMin + durationMin;

      const newPreview = {
        eventId,
        dayIso,
        startMin,
        endMin,
        ok: true,
        conflicts: [],
      };
      dragPreviewRef.current = newPreview;
      setDragPreview(newPreview);

      // Debounced server validation (so you can show red overlay while dragging)
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
      validateTimerRef.current = setTimeout(async () => {
        try {
          const destDate = new Date(dayIso + 'T00:00:00');
          const proposedStart = new Date(destDate);
          proposedStart.setHours(0, 0, 0, 0);
          proposedStart.setMinutes(startMin);

          const proposedEnd = new Date(proposedStart.getTime() + durationMin * 60000);

          const { data: validation, error } = await supabase.rpc('validate_event_drop', {
            _family_id: currentFamilyId,
            _event_id: eventId,
            _proposed_start: proposedStart.toISOString(),
            _proposed_end: proposedEnd.toISOString(),
          });

          const ok = !!validation?.ok && !error;

          const updatedPreview = {
            ...(dragPreviewRef.current || {}),
            ok,
            conflicts: validation?.conflicts || [],
          };
          dragPreviewRef.current = updatedPreview;
          setDragPreview(updatedPreview);
        } catch (e) {
          const errorPreview = {
            ...(dragPreviewRef.current || {}),
            ok: false,
            conflicts: [],
          };
          dragPreviewRef.current = errorPreview;
          setDragPreview(errorPreview);
        }
      }, 120);
    };
    
    const handleMouseUp = async (upEvent) => {
      // Clean up validation timer
      if (validateTimerRef.current) {
        clearTimeout(validateTimerRef.current);
        validateTimerRef.current = null;
      }

      // Read latest preview from ref (always up-to-date)
      const preview = dragPreviewRef.current;
      if (!preview || preview.eventId !== eventId) {
        // Cleanup
        setDragState(null);
        setDraggedEventId(null);
        dragPreviewRef.current = null;
        setDragPreview(null);
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }

      if (!preview.ok) {
        // Format conflict message with details
        const conflictMsg = formatConflictMessage(preview.conflicts, children);
        Alert.alert('Cannot Move Event', conflictMsg);
        setDragState(null);
        setDraggedEventId(null);
        dragPreviewRef.current = null;
        setDragPreview(null);
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }

      // Find the event being dragged
      const event = currentFiltEvents.find(ev => ev.id === eventId);
      if (!event) {
        setDragState(null);
        setDraggedEventId(null);
        dragPreviewRef.current = null;
        setDragPreview(null);
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }

      const destDate = new Date(preview.dayIso + 'T00:00:00');
      const proposedStart = new Date(destDate);
      proposedStart.setHours(0, 0, 0, 0);
      proposedStart.setMinutes(preview.startMin);

      const durationMin = Math.max(5, Math.round((new Date(event.end_ts).getTime() - new Date(event.start_ts).getTime()) / 60000));
      const proposedEnd = new Date(proposedStart.getTime() + durationMin * 60000);

      // Optimistic update
      const optimisticEvent = Object.assign({}, event, {
        start_ts: proposedStart.toISOString(),
        end_ts: proposedEnd.toISOString(),
        date_local: getLocalDateString(proposedStart),
      });
      setLocalEvents(prev => ({ ...prev, [eventId]: optimisticEvent }));

      // Call API to reschedule
      try {
        const { data: updateResult, error: updateError } = await supabase.rpc('apply_event_time_update', {
          _family_id: currentFamilyId,
          _event_id: eventId,
          _start_ts: proposedStart.toISOString(),
          _end_ts: proposedEnd.toISOString(),
          _reason: 'drag_drop',
        });

        if (updateError || !updateResult?.ok) {
          throw new Error(updateError?.message || updateResult?.validation?.reason || 'Failed to update event');
        }

        const updatedEvent = updateResult.after;
        
        if (updatedEvent) {
          setLocalEvents(prev => ({ ...prev, [eventId]: updatedEvent }));
        }
        
        // Refresh busy blocks if Scheduling Assistant is enabled
        if (currentSchedulingAssistantEnabled) {
          const weekEnd = addDays(currentWeekStart, 7);
          const { data: fbData } = await supabase.rpc('get_freebusy_week', {
            _family_id: currentFamilyId,
            _from: currentWeekStart.toISOString(),
            _to: weekEnd.toISOString(),
            _child_ids: currentSelectedChildIds && currentSelectedChildIds.length > 0 ? currentSelectedChildIds : null,
          });
          if (fbData) {
            setBusyBlocks(fbData.busy || []);
          }
        }
        
        // Commit animation: animate ghost to final position
        // The final position is the same as the preview position (since we're moving to that spot)
        setCommitAnimation({
          eventId,
          dayIso: preview.dayIso,
          startMin: preview.startMin,
          endMin: preview.endMin,
        });
        
        // Clear dragPreview immediately (ghost will use commitAnimation instead)
        setDragPreview(null);
        dragPreviewRef.current = null;
        
        // Clear commitAnimation after animation completes (180ms)
        setTimeout(() => {
          setCommitAnimation(null);
        }, 180);
      } catch (err) {
        // Revert optimistic update on exception
        setLocalEvents(prev => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
        Alert.alert('Error', `Failed to reschedule event: ${err.message || 'Unknown error'}`);
        handleWeekStartChange(new Date(currentWeekStart));
      }
      
      setDragState(null);
      setDraggedEventId(null);
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Cleanup on unmount or drag end
    return () => {
      if (validateTimerRef.current) {
        clearTimeout(validateTimerRef.current);
        validateTimerRef.current = null;
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [weekStart, handleWeekStartChange, familyId, schedulingAssistantEnabled, selectedChildIds]);
  
  // Early return for loading state - must be after all hooks
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading week...</Text>
      </View>
    );
  }
  
  return (
    <Wrapper style={wrapperStyle}>
        {/* Header with freeze toggle */}
        <View style={styles.weekHeader}>
          <View style={styles.weekHeaderLeft}>
            <Text style={styles.weekHeaderSubtitle}>
              {`${getLocalDateString(weekStart)} - ${getLocalDateString(addDays(weekStart, 6))}`}
            </Text>
          </View>
          <View style={styles.weekHeaderRight}>
            {selectedChildIds.length === 1 && (
              <TouchableOpacity
                style={styles.saveTemplateButton}
                onPress={async () => {
                  try {
                    const weekStartStr = getLocalDateString(getWeekStart(weekStart));
                    // Use HTML format for direct printing
                    const { error } = await getWeeklyPacket(selectedChildIds[0], weekStartStr, 'html');
                    if (error) {
                      Alert.alert('Error', `Failed to generate weekly packet: ${error.message || 'Unknown error'}`);
                    }
                  } catch (err) {
                    Alert.alert('Error', `Failed to generate weekly packet: ${err.message || 'Unknown error'}`);
                  }
                }}
                activeOpacity={0.7}
              >
                <Printer size={14} color={colors.accent} />
                <Text style={styles.saveTemplateButtonText}>
                  Print Weekly Packet
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveTemplateButton, schedulingAssistantEnabled && styles.saveTemplateButtonActive]}
              onPress={() => setSchedulingAssistantEnabled(!schedulingAssistantEnabled)}
              activeOpacity={0.7}
            >
              <Calendar size={14} color={schedulingAssistantEnabled ? colors.white : colors.accent} />
              <Text style={[styles.saveTemplateButtonText, schedulingAssistantEnabled && styles.saveTemplateButtonTextActive]}>
                Scheduling Assistant
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveTemplateButton}
              onPress={() => setShowBulkRescheduleModal(true)}
              activeOpacity={0.7}
            >
              <Sparkles size={14} color={colors.accent} />
              <Text style={styles.saveTemplateButtonText}>
                Reschedule
              </Text>
            </TouchableOpacity>
            {selectedChildIds.length > 0 && (
              <TouchableOpacity
                style={styles.saveTemplateButton}
                onPress={() => setShowWeeklyReshuffle(true)}
                activeOpacity={0.7}
              >
                <Sparkles size={14} color={colors.accent} />
                <Text style={styles.saveTemplateButtonText}>
                  Weekly Reshuffle
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.saveTemplateButton}
              onPress={() => setShowSaveTemplateModal(true)}
              disabled={selectedChildIds.length === 0}
              activeOpacity={0.7}
            >
              <Save size={14} color={selectedChildIds.length > 0 ? colors.accent : colors.muted} />
              <Text style={[styles.saveTemplateButtonText, selectedChildIds.length === 0 && styles.saveTemplateButtonTextDisabled]}>
                Save as Template
              </Text>
            </TouchableOpacity>
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
        </View>

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
                      <Text style={styles.dayHeaderDow}>{fmtDow(d)}</Text>
                      <Text style={[
                        styles.dayHeaderDate,
                        d.getMonth() !== weekStart.getMonth() && styles.dayHeaderDateOtherMonth
                      ]}> {d.getDate()}</Text>
                    </Text>{patternDay ? (
                      <View style={styles.patternDayBadge}>
                        <Text style={styles.patternDayText}>{patternDay}</Text>
                      </View>
                    ) : null}
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
              contentContainerStyle={{}} // Minimal - actual layout in inner View
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
              {/* Grid body wrapper with ref for measuring */}
              <View
                ref={gridBodyRef}
                style={styles.gridBody}
                {...(typeof window !== 'undefined' && { id: 'planner-week-grid-body' })}
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
                      {`${hour12}:${mm} ${period}`}
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
                    familyId={familyId}
                    schedulingAssistantEnabled={schedulingAssistantEnabled}
                    busyBlocks={busyBlocks}
                    dragPreview={dragPreview}
                    commitAnimation={commitAnimation}
                    onAdd={(startMin) => {
                      onAddActivity?.({ date: iso, startMin });
                    }}
                    onEventChanged={handleEventChanged}
                    onEventClick={handleEventClick}
                    onMouseDragStart={handleMouseDragStart}
                  />
                );
              })}
              </View> {/* End gridBody wrapper */}
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

      {/* Bulk Reschedule Modal */}
      <BulkRescheduleModal
        visible={showBulkRescheduleModal}
        onClose={() => setShowBulkRescheduleModal(false)}
        familyId={familyId}
        weekStart={weekStart}
        weekEnd={addDays(weekStart, 7)}
        childIds={selectedChildIds}
        onApplied={() => {
          // Force refresh
          handleWeekStartChange((() => {
            const newDate = new Date(weekStart);
            newDate.setMilliseconds(newDate.getMilliseconds() + 1);
            return newDate;
          })());
          // Refresh busy blocks if enabled
          if (schedulingAssistantEnabled) {
            const weekEnd = addDays(weekStart, 7);
            supabase.rpc('get_freebusy_week', {
              _family_id: familyId,
              _from: weekStart.toISOString(),
              _to: weekEnd.toISOString(),
              _child_ids: selectedChildIds && selectedChildIds.length > 0 ? selectedChildIds : null,
            }).then(({ data: fbData }) => {
              if (fbData) {
                setBusyBlocks(fbData.busy || []);
              }
            });
          }
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
  saveTemplateButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  saveTemplateButtonTextActive: {
    color: colors.white,
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
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
        shadowRadius: 2,
        elevation: 1,
      },
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
  dragGhost: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderWidth: 2,
    borderRadius: 8,
    zIndex: 999,
  },
  dragGhostCommitting: {
    transition: 'all 180ms ease-out',
    WebkitTransition: 'all 180ms ease-out',
  },
  dragGhostIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -8,
    marginLeft: -8,
    zIndex: 1000,
    ...(typeof window !== 'undefined' && {
      transform: 'translate(-50%, -50%)',
    }),
  },
  busyBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    pointerEvents: 'none',
    zIndex: 1,
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

