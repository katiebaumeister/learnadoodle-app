import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, Platform } from 'react-native';
import { colors } from '../../theme/colors';
import EventDetails from './EventDetails';
import { getEvent, getSyllabusById } from '../../lib/apiClient';

export default function EventModal({
  eventId,
  visible,
  onClose,
  onEventUpdated,
  onEventDeleted,
  initialEvent = null,
  familyMembers = [],
  onEventPatched,
  familyId,
  children = [],
  schedulingMode = false,
  editScope = 'single',
  preloadedAcademicYears = null,
  /** Subjects loaded with WebLayout (id, name, child_id) — seeds EventDetails before refetch */
  preloadedSubjects = null,
  /** 'tutor' = read-first event details; no schedule ownership affordances */
  viewerRole = null,
  /** Child/tutor: parent disabled add/edit events in User Controls */
  denyFamilyEventEdit = false,
  /** From planner chip conflict icon — show top banner with Auto reschedule / Ignore */
  openConflictResolution = false,
  conflictResolutionContext = null,
  onOpenConflictResolutionConsumed,
}) {
  const [event, setEvent] = useState(initialEvent);
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(!initialEvent);
  const [isEditingState, setIsEditingState] = useState(false);
  const lastAppliedEventSignatureRef = useRef('');
  
  // Use schedulingMode directly when opening - this ensures immediate edit mode
  // without waiting for effects to run
  const isEditing = schedulingMode || isEditingState;

  const handleEditingChange = (editing) => {
    setIsEditingState(editing);
  };

  // Sync editing state when schedulingMode changes (for when user manually exits edit mode)
  useLayoutEffect(() => {
    if (visible && schedulingMode) {
      setIsEditingState(true);
    }
  }, [visible, schedulingMode]);

  const isReadOnlyPublicHoliday = (initial) => {
    const holidayType = String(initial?.holiday_type || initial?.holidayType || '').toUpperCase();
    return holidayType === 'GLOBAL_HOLIDAY';
  };
  const isSyntheticPlannerExclusionEvent = (id, initial) => {
    const source = String(initial?.source || initial?.data?.source || '').toLowerCase();
    if (source === 'planner_exclusion') return true;
    // Synthetic holiday rows (holiday-*) don't exist in events table; keep initial payload and skip DB fetch.
    return !!(id && typeof id === 'string' && id.startsWith('holiday-'));
  };
  const eventReadOnly = isReadOnlyPublicHoliday(event) || viewerRole === 'tutor' || denyFamilyEventEdit;
  const readOnlyReason = denyFamilyEventEdit ? 'permissions' : null;

  const initialEventSignature = [
    String(initialEvent?.id || ''),
    String(initialEvent?.updated_at || ''),
    String(initialEvent?.start_ts || ''),
    String(initialEvent?.end_ts || ''),
    String(initialEvent?.start_local || ''),
    String(initialEvent?.end_local || ''),
    String(initialEvent?.status || ''),
  ].join('|');

  const toEventSignature = useCallback((ev) => {
    if (!ev) return '';
    const recurrenceSig =
      ev.recurrence_rule == null
        ? ''
        : (typeof ev.recurrence_rule === 'string'
          ? ev.recurrence_rule
          : JSON.stringify(ev.recurrence_rule));
    const curriculumMetaSig =
      ev.curriculum_metadata == null
        ? ''
        : (typeof ev.curriculum_metadata === 'string'
          ? ev.curriculum_metadata
          : JSON.stringify(ev.curriculum_metadata));
    return [
      String(ev.id || ''),
      String(ev.updated_at || ''),
      String(ev.start_ts || ev.start || ev.start_local || ''),
      String(ev.end_ts || ev.end || ev.end_local || ''),
      String(ev.status || ''),
      String(ev.event_type || ''),
      String(ev.subject_id || ''),
      curriculumMetaSig,
      String(ev.child_id || ''),
      Array.isArray(ev.child_ids) ? ev.child_ids.map(String).sort().join(',') : '',
      String(ev.material_id || ''),
      recurrenceSig,
    ].join('|');
  }, []);

  useEffect(() => {
    if (visible && eventId) {
      if (isSyntheticPlannerExclusionEvent(eventId, initialEvent)) {
        setEvent(initialEvent || null);
        setLoading(false);
        return;
      }
      // Set initialEvent optimistically for immediate display
      if (initialEvent) {
        setEvent((prev) => {
          const prevSig = toEventSignature(prev);
          const nextSig = toEventSignature(initialEvent);
          if (prevSig === nextSig) return prev;
          lastAppliedEventSignatureRef.current = nextSig;
          return initialEvent;
        });
        setLoading(false);
      }
      // Always reload from database; use DB times (forceUseDb=true) so plan-applied times show correctly
      loadEvent(true);
    } else {
      const nextEvent = initialEvent ?? null;
      setEvent((prev) => {
        const prevSig = toEventSignature(prev);
        const nextSig = toEventSignature(nextEvent);
        if (prevSig === nextSig) return prev;
        lastAppliedEventSignatureRef.current = nextSig;
        return nextEvent;
      });
      setSyllabus(null);
      setLoading(!initialEvent);
      setIsEditingState(false); // Start in view mode for existing events
    }
  }, [visible, eventId, initialEventSignature, toEventSignature]);
  
  const loadEvent = useCallback(async (forceUseDb = false) => {
    if (!eventId) return;
    if (isSyntheticPlannerExclusionEvent(eventId, initialEvent)) return;

    if (!initialEvent) {
      setLoading(true);
    }
    try {
      const { data, error } = await getEvent(eventId);
      
      if (error) {
        setEvent(prev => prev || initialEvent || null);
        return;
      }
      
      if (!data) {
        setEvent(prev => prev || initialEvent || null);
        return;
      }

      // When forceUseDb (after plan apply / calendar refresh), use raw DB data so plan time updates show
      if (forceUseDb) {
        const next = { ...data };
        const nextSig = toEventSignature(next);
        if (lastAppliedEventSignatureRef.current !== nextSig) {
          lastAppliedEventSignatureRef.current = nextSig;
          setEvent(next);
        }
        setLoading(false);
        return;
      }
      
      setEvent(prev => {
        // Check if initialEvent has optimistic updates (different times than database)
        const hasOptimisticUpdate = initialEvent && (
          (initialEvent.start_ts && initialEvent.start_ts !== data.start_ts) ||
          (initialEvent.end_ts && initialEvent.end_ts !== data.end_ts) ||
          (initialEvent.start_local && initialEvent.start_local !== data.start_local) ||
          (initialEvent.end_local && initialEvent.end_local !== data.end_local)
        );
        
        // Merge data - prioritize database data (data) over previous/initialEvent data (prev)
        // But preserve child_ids from prev if data doesn't have it (important for flexible events)
        const prevChildIds = prev?.child_ids;
        const prevChildId = prev?.child_id;
        const prevChild = prev?.child;
        
        const dataWithoutChildFields = { ...data };
        delete dataWithoutChildFields.child_ids;
        delete dataWithoutChildFields.child_id;
        delete dataWithoutChildFields.child;
        
        const merged = { ...(prev || {}), ...dataWithoutChildFields };
        
        if ('child_ids' in data) {
          merged.child_ids = data.child_ids;
        } else if (prevChildIds !== undefined) {
          merged.child_ids = prevChildIds;
        }
        
        if ('child_id' in data) {
          merged.child_id = data.child_id;
        } else if (prevChildId !== undefined) {
          merged.child_id = prevChildId;
        }
        
        if (data?.child) {
          merged.child = data.child;
        } else if (prevChild && !merged.child) {
          merged.child = prevChild;
        }
        
        if (hasOptimisticUpdate && initialEvent) {
          if (initialEvent.start_ts) merged.start_ts = initialEvent.start_ts;
          if (initialEvent.end_ts) merged.end_ts = initialEvent.end_ts;
          if (initialEvent.start_local) merged.start_local = initialEvent.start_local;
          if (initialEvent.end_local) merged.end_local = initialEvent.end_local;
          if (initialEvent.updated_at && (!data.updated_at || new Date(initialEvent.updated_at) > new Date(data.updated_at))) {
            merged.updated_at = initialEvent.updated_at;
          }
        }
        
        if (data.subject_id && prev?.subject && typeof prev.subject === 'string') {
          delete merged.subject;
        }
        
        const prevSig = toEventSignature(prev);
        const nextSig = toEventSignature(merged);
        if (prevSig === nextSig) return prev;
        lastAppliedEventSignatureRef.current = nextSig;
        return merged;
      });
      
      // If event has syllabus link, load syllabus
      if (data?.source_syllabus_id) {
        const { data: syllabusData, error: syllabusError } = await getSyllabusById(data.source_syllabus_id);
        if (!syllabusError && syllabusData) {
          setSyllabus(syllabusData);
        }
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, [eventId, initialEventSignature, toEventSignature]);
  
  // Listen for event reschedule events to refresh the event data
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleEventRescheduled = (e) => {
      const { eventId: rescheduledEventId } = e.detail || {};
      // If this modal is showing the rescheduled event, reload it
      if (rescheduledEventId === eventId && visible) {
        console.log('[EventModal] Event was rescheduled, reloading event data');
        // Use a small delay to ensure database has committed the change
        setTimeout(() => {
          loadEvent();
        }, 200);
      }
    };
    
    window.addEventListener('eventRescheduled', handleEventRescheduled);
    return () => {
      window.removeEventListener('eventRescheduled', handleEventRescheduled);
    };
  }, [eventId, visible, loadEvent]);

  // When calendar refreshes or plan applied: refetch this event so plan time updates show immediately
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refetchFromDb = () => {
      if (visible && eventId) {
        loadEvent(true); // forceUseDb so we show updated start_ts from DB (e.g. after plan apply)
      }
    };
    const handleRefreshCalendar = () => refetchFromDb();
    const handlePlanApplied = () => {
      if (visible && eventId) {
        setEvent(null);
        setLoading(true);
        // Delay so backend commit is visible, then refetch and show DB times
        setTimeout(() => loadEvent(true), 500);
      }
    };
    window.addEventListener('refreshCalendar', handleRefreshCalendar);
    window.addEventListener('planAppliedToCalendar', handlePlanApplied);
    return () => {
      window.removeEventListener('refreshCalendar', handleRefreshCalendar);
      window.removeEventListener('planAppliedToCalendar', handlePlanApplied);
    };
  }, [visible, eventId, loadEvent]);

  const handleEventUpdated = () => {
    loadEvent(); // Reload event data
    onEventUpdated?.();
  };

  const handleEventDeleted = (deletedEventId) => {
    onEventDeleted?.(deletedEventId);

    onClose();
  };

  const handleEventPatched = (patch) => {
    const patchWithId = {
      id: patch?.id || eventId || event?.id,
      ...patch,
    };
    setEvent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      
      // Handle child_id and child_ids - important for flexible events with overlaps
      if (typeof patch.child_id !== 'undefined') {
        next.child_id = patch.child_id;
      }
      if (typeof patch.child_ids !== 'undefined') {
        next.child_ids = patch.child_ids;
      }
      
      // If child_id is null but child_ids has values, use child_ids[0] to find the child
      // This handles the case where flexible events use child_ids array instead of child_id
      const effectiveChildId = next.child_id || (next.child_ids && next.child_ids.length > 0 ? next.child_ids[0] : null);
      
      if (effectiveChildId) {
        const childMatch = familyMembers.find((m) => m.id === effectiveChildId);
        if (childMatch) {
          next.child = {
            ...(prev.child || {}),
            id: childMatch.id,
            first_name: childMatch.name,
            name: childMatch.name,
          };
        }
      } else {
        // If both child_id and child_ids are empty/null, clear the child
        next.child = null;
      }
      
      if (typeof patch.tags !== 'undefined') {
        next.tags = patch.tags;
      }
      if (typeof patch.status !== 'undefined') {
        next.status = patch.status;
      }
      if (typeof patch.title !== 'undefined') {
        next.title = patch.title;
      }
      if (typeof patch.description !== 'undefined') {
        next.description = patch.description;
      }
      if (typeof patch.start_ts !== 'undefined') {
        next.start_ts = patch.start_ts;
      }
      if (typeof patch.end_ts !== 'undefined') {
        next.end_ts = patch.end_ts;
      }
      if (typeof patch.is_flexible !== 'undefined') {
        next.is_flexible = patch.is_flexible;
      }
      return next;
    });
    if (patchWithId.id) {
      onEventPatched?.(patchWithId);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={StyleSheet.absoluteFill}
          accessibilityRole={Platform.OS === 'web' ? 'button' : undefined}
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web'
            ? { onClick: onClose, onMouseDown: onClose }
            : { onTouchEnd: onClose })}
        />
        <View
          style={[
            styles.container,
            isEditing && styles.containerEditMode,
          ]}
        >
          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={[styles.content, isEditing && styles.contentEditMode]}>
              {event ? (
                <EventDetails
                  key={`edit-${event.id}`}
                  event={event}
                  onEventUpdated={handleEventUpdated}
                  onEventDeleted={(deletedEventId) => {
                    handleEventDeleted(deletedEventId);
                  }}
                  onEventPatched={handleEventPatched}
                  familyMembers={familyMembers}
                  familyId={familyId}
                  onEditingChange={handleEditingChange}
                  onClose={onClose}
                  initialSchedulingMode={schedulingMode}
                  editScope={editScope}
                  readOnly={eventReadOnly}
                  readOnlyReason={readOnlyReason}
                  viewerRole={viewerRole}
                  preloadedAcademicYears={preloadedAcademicYears}
                  preloadedSubjects={preloadedSubjects}
                  openConflictResolution={openConflictResolution}
                  conflictResolutionContext={conflictResolutionContext}
                  onOpenConflictResolutionConsumed={onOpenConflictResolutionConsumed}
                />
              ) : (
                <View style={styles.loadingContainer}>
                  <Text style={{ color: colors.muted }}>Event details not available.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayTransparent: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  container: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 30,
    width: '100%',
    maxWidth: 860,
    maxHeight: Platform.OS === 'web' ? '80vh' : '86%',
    minHeight: Platform.OS === 'web' ? 320 : '46%',
    ...(Platform.OS === 'web' && {
      height: 'auto',
    }),
    shadowColor: '#24324A',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    overflow: 'hidden',
  },
  containerEditMode: {
    width: '100%',
    maxWidth: 860,
    maxHeight: Platform.OS === 'web' ? '80vh' : '86%',
    minHeight: Platform.OS === 'web' ? 392 : '54%',
    ...(Platform.OS === 'web' && {
      height: 'auto',
    }),
  },
  containerHidden: {
    width: 0,
    height: 0,
    minHeight: 0,
    maxHeight: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12, // Reduced from 16
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600', // semibold
    color: colors.text,
  },
  closeButton: {
    padding: 4,
    opacity: 0.6,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 0,
    backgroundColor: 'transparent',
    gap: 32, // Increased from 24
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    position: 'relative',
  },
  tabActive: {
    // Active state handled by underline
  },
  tabText: {
    fontSize: 14,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)', // Muted gray for inactive
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.text || '#111827', // Darker text for active
    fontWeight: '500',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3, // Increased from 2 for slightly thicker underline
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    borderRadius: 1,
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: 'transparent',
  },
  contentEditMode: {
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
});

