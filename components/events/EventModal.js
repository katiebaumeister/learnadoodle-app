import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import EventDetails from './EventDetails';
import { getEvent, getSyllabusById } from '../../lib/apiClient';

export default function EventModal({ eventId, visible, onClose, onEventUpdated, onEventDeleted, initialEvent = null, familyMembers = [], onEventPatched, familyId, children = [] }) {
  const [event, setEvent] = useState(initialEvent);
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(!initialEvent);
  const [isEditing, setIsEditing] = useState(false); // Start in view mode

  const handleEditingChange = (editing) => {
    console.log('[EventModal] Editing state changed:', editing);
    setIsEditing(editing);
  };

  useEffect(() => {
    if (visible && eventId) {
      // Set initialEvent optimistically for immediate display
      if (initialEvent) {
        setEvent(initialEvent);
        setLoading(false);
      }
      // Always reload from database to get latest data (especially important for child_ids after save)
      loadEvent();
    } else {
      setEvent(initialEvent ?? null);
      setSyllabus(null);
      setLoading(!initialEvent);
      setIsEditing(false); // Start in view mode for existing events
    }
  }, [visible, eventId, initialEvent]);

  const loadEvent = async () => {
    if (!eventId) return;
    
    console.log('[EventModal] loadEvent called for eventId:', eventId);
    
    if (!event && !initialEvent) {
      setLoading(true);
    }
    try {
      console.log('[EventModal] Calling getEvent for eventId:', eventId);
      const { data, error } = await getEvent(eventId);
      
      console.log('[EventModal] getEvent returned:', {
        hasData: !!data,
        hasError: !!error,
        data_child_id: data?.child_id,
        data_child_ids: data?.child_ids,
        error: error?.message
      });
      
      if (error) {
        console.warn('[EventModal] getEvent error:', error);
        setEvent(prev => prev || initialEvent || null);
        return;
      }
      
      if (!data) {
        console.warn('[EventModal] getEvent returned no data');
        setEvent(prev => prev || initialEvent || null);
        return;
      }
      
      setEvent(prev => {
        // Check if initialEvent has optimistic updates (different times than database)
        // If so, preserve the optimistic times from initialEvent
        const hasOptimisticUpdate = initialEvent && (
          (initialEvent.start_ts && initialEvent.start_ts !== data.start_ts) ||
          (initialEvent.end_ts && initialEvent.end_ts !== data.end_ts) ||
          (initialEvent.start_local && initialEvent.start_local !== data.start_local) ||
          (initialEvent.end_local && initialEvent.end_local !== data.end_local)
        );
        
        console.log('[EventModal] loadEvent - merging data:', {
          prev_child_id: prev?.child_id,
          prev_child_ids: prev?.child_ids,
          data_child_id: data?.child_id,
          data_child_ids: data?.child_ids,
          data_child: data?.child
        });
        
        // Merge data - prioritize database data (data) over previous/initialEvent data (prev)
        // But preserve child_ids from prev if data doesn't have it (important for flexible events)
        // Extract child-related fields first to handle them explicitly
        const prevChildIds = prev?.child_ids;
        const prevChildId = prev?.child_id;
        const prevChild = prev?.child;
        const dataChildIds = data?.child_ids;
        const dataChildId = data?.child_id;
        const dataChild = data?.child;
        
        // Merge all fields, but handle child-related fields explicitly to preserve them correctly
        // Remove child-related fields from data before merging to avoid overwriting
        const dataWithoutChildFields = { ...data };
        delete dataWithoutChildFields.child_ids;
        delete dataWithoutChildFields.child_id;
        delete dataWithoutChildFields.child;
        
        const merged = { ...(prev || {}), ...dataWithoutChildFields };
        
        // Handle child_ids and child_id explicitly - prioritize database data but preserve if not present
        // This is critical for flexible events where child_id might be NULL but child_ids has values
        // Only overwrite if the database explicitly provides a value (including null), otherwise preserve existing
        if ('child_ids' in data) {
          // Database explicitly provided child_ids (could be null, [], or [uuid])
          merged.child_ids = data.child_ids;
        } else if (prevChildIds !== undefined) {
          // Database didn't provide child_ids, preserve previous value
          merged.child_ids = prevChildIds;
        }
        
        if ('child_id' in data) {
          // Database explicitly provided child_id (could be null or uuid)
          merged.child_id = data.child_id;
        } else if (prevChildId !== undefined) {
          // Database didn't provide child_id, preserve previous value
          merged.child_id = prevChildId;
        }
        
        // child object should be set from getEvent() result, but preserve from prev if not present
        if (dataChild) {
          merged.child = dataChild;
        } else if (prevChild && !merged.child) {
          merged.child = prevChild;
        }
        
        // If initialEvent has optimistic updates, preserve the time fields
        if (hasOptimisticUpdate && initialEvent) {
          if (initialEvent.start_ts) merged.start_ts = initialEvent.start_ts;
          if (initialEvent.end_ts) merged.end_ts = initialEvent.end_ts;
          if (initialEvent.start_local) merged.start_local = initialEvent.start_local;
          if (initialEvent.end_local) merged.end_local = initialEvent.end_local;
          // Also preserve updated_at if it's more recent
          if (initialEvent.updated_at && (!data.updated_at || new Date(initialEvent.updated_at) > new Date(data.updated_at))) {
            merged.updated_at = initialEvent.updated_at;
          }
        }
        
        // If loaded event has subject_id, remove any string subject from initialEvent
        // to prevent showing wrong subject name
        if (data.subject_id && prev?.subject && typeof prev.subject === 'string') {
          // Remove the string subject from initialEvent - the loaded event will resolve it correctly
          delete merged.subject;
        }
        
        console.log('[EventModal] loadEvent - merged event:', {
          child_id: merged.child_id,
          child_ids: merged.child_ids,
          child: merged.child
        });
        
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
  };

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

  // Debug log
  if (typeof window !== 'undefined') {
    console.log('[EventModal] Rendering, isEditing:', isEditing);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.container, isEditing && styles.containerEditMode]}>
          {/* Header - hidden when editing */}
          {!isEditing && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Event Details</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={18} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
              </TouchableOpacity>
            </View>
          )}

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={[styles.content, isEditing && styles.contentEditMode]}>
              {event ? (
                <EventDetails
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
  },
  container: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    ...shadows.large,
    overflow: 'hidden',
  },
  containerEditMode: {
    maxWidth: 720,
    width: '90%',
    maxHeight: '90%',
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
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentEditMode: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
});

