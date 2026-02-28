/**
 * Planner Client with Offline Support
 * Wraps planner operations with offline storage and instant sync
 */
import { supabase } from '../supabase';
import { rescheduleEvent as apiRescheduleEvent } from '../apiClient';
import * as offlineStorage from './offlineStorage';
import * as instantSync from './instantSync';

/**
 * Reschedule event with optimistic update
 */
export async function rescheduleEvent(eventId, newStartAt, newEndAt, origin = 'drag_drop', reason = 'manual move', familyId) {
  try {
    // Get current event from offline storage
    const currentEvent = await offlineStorage.getEvent(eventId);
    
    if (!currentEvent) {
      // Fallback to API if not in cache
      return await apiRescheduleEvent(eventId, newStartAt, newEndAt, origin, reason);
    }

    // Optimistic update
    const updatedEvent = {
      ...currentEvent,
      start_ts: newStartAt,
      end_ts: newEndAt,
      updated_at: new Date().toISOString(),
    };

    // Update locally immediately
    await instantSync.updateEventOptimistic(eventId, {
      start_ts: newStartAt,
      end_ts: newEndAt,
    }, familyId || currentEvent.family_id);

    // Try to sync in background
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const { data, error } = await apiRescheduleEvent(eventId, newStartAt, newEndAt, origin, reason);
      if (error) {
        // Check for conflict errors - may be 409 or 500 with overlap/conflict in message
        const errorMessage = error.message || '';
        const isConflict = error.status === 409 ||
                          errorMessage.toLowerCase().includes('overlap') ||
                          errorMessage.toLowerCase().includes('conflict') ||
                          errorMessage.toLowerCase().includes('exclusion');
        
        if (isConflict) {
          console.warn(`[plannerClientWithOffline] Reschedule conflict detected for event ${eventId}:`, error.message);
          return { data: updatedEvent, error: { ...error, isConflict: true } };
        }
        // For other errors, still return the optimistic update but with error
        return { data: updatedEvent, error };
      }
          // Update with server response
      if (data) {
        await offlineStorage.storeEvent({ ...data, family_id: familyId || currentEvent.family_id }, { sync_status: 'synced' });
        }
    }

    return { data: updatedEvent, error: null };
  } catch (err) {
    // Fallback to API
    return await apiRescheduleEvent(eventId, newStartAt, newEndAt, origin, reason);
  }
}

/**
 * Create event with optimistic update
 */
export async function createEvent(eventData, familyId) {
  try {
    // Use instant sync for optimistic create
    const optimisticEvent = await instantSync.createEventOptimistic(eventData, familyId);
    
    // Also try to create via RPC in background if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      supabase.rpc('create_task_event', {
        _family_id: familyId,
        _child_id: eventData.child_id,
        _title: eventData.title || 'Untitled Event',
        _start_ts: eventData.start_ts || eventData.start,
        _description: eventData.description || null,
        _end_ts: eventData.end_ts || eventData.end || null,
        _status: eventData.status || 'scheduled',
        _source: eventData.source || 'manual',
        _tags: eventData.tags || null,
        _is_flexible: eventData.is_flexible || false,
        _event_type: eventData.event_type || null,
        _subject_id: eventData.subject_id || null,
        _unit: eventData.unit || null,
        _grade: eventData.grade || null,
        _location: eventData.location || null,
        _mode: eventData.mode || null,
        _instructor: eventData.instructor || null,
        _goal_link: eventData.goal_link || null,
        _minutes: eventData.minutes || 60,
        _materials_attachment_ids: eventData.materials_attachment_ids || null,
        _source_link: eventData.source_link || null,
        _resume_position: eventData.resume_position || null,
      }).then(({ data: rpcData, error: rpcError }) => {
        if (!rpcError && rpcData?.ok && rpcData.event) {
          // Update with real ID
          offlineStorage.removeEvent(optimisticEvent.id);
          offlineStorage.storeEvent({ ...rpcData.event, family_id: familyId }, { sync_status: 'synced' });
        }
      }).catch(err => {
      });
    }

    return { data: optimisticEvent, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete event with optimistic update
 */
export async function deleteEvent(eventId, familyId) {
  try {
    // Use instant sync for optimistic delete
    await instantSync.deleteEventOptimistic(eventId, familyId);
    
    // Also try to soft delete via API in background if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', eventId)
        .is('deleted_at', null); // Only update if not already deleted
      
      if (error) {
        // Remove from sync queue on error so it can retry
        const queue = await offlineStorage.getSyncQueue('pending');
        const queueItem = queue.find(item => 
          item.table_name === 'events' && item.record_id === eventId
        );
        if (queueItem) {
          await offlineStorage.updateSyncQueueItem(queueItem.id, { status: 'pending' });
        }
      } else {
        // Success - remove from local storage
        await offlineStorage.removeEvent(eventId);
      }
    }

    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update event with optimistic update
 */
export async function updateEvent(eventId, updates, familyId) {
  try {
    return await instantSync.updateEventOptimistic(eventId, updates, familyId);
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Permanently delete all trash events for a family (hard delete)
 * WARNING: This permanently removes all soft-deleted events from the database
 */
export async function permanentlyDeleteAllTrashEvents(familyId) {
  if (!familyId) {
    throw new Error('Family ID is required to permanently delete trash events');
  }

  // Use the RPC function (bypasses RLS, uses SECURITY DEFINER)
  const { data: rpcData, error: rpcError } = await supabase.rpc('permanently_delete_all_trash_events', {
    _family_id: familyId,
  });

  if (rpcError) {
    console.error('[permanentlyDeleteAllTrashEvents] RPC error:', rpcError);
    throw new Error(rpcError.message || 'Failed to permanently delete trash events');
  }

  if (!rpcData?.success) {
    throw new Error(rpcData?.error || 'Failed to permanently delete trash events');
  }

  // RPC succeeded - all trash events are permanently deleted
  return { 
    success: true, 
    deleted_count: rpcData.deleted_count || 0
  };
}

/**
 * Restore a single event from trash (clear deleted_at).
 * If restoring would violate overlap constraint, sets is_flexible = true so it succeeds; caller can show conflict banner.
 * Preserves academic_year_id so event stays in plan if it was part of one.
 * @returns {{ data: object | null, error: Error | null, hadConflict: boolean }}
 */
export async function restoreEventFromTrash(eventId, familyId) {
  if (!eventId || !familyId) {
    return { data: null, error: new Error('Event ID and Family ID are required'), hadConflict: false };
  }
  try {
    let hadConflict = false;
    const { data: updated, error: updateError } = await supabase
      .from('events')
      .update({ deleted_at: null })
      .eq('id', eventId)
      .eq('family_id', familyId)
      .not('deleted_at', 'is', null)
      .select()
      .single();

    if (updateError) {
      const msg = (updateError.message || '').toLowerCase();
      const isOverlap = msg.includes('overlap') || msg.includes('conflict') || updateError.code === '23P01';
      if (isOverlap) {
        const { data: retryData, error: retryError } = await supabase
          .from('events')
          .update({ deleted_at: null, is_flexible: true })
          .eq('id', eventId)
          .eq('family_id', familyId)
          .not('deleted_at', 'is', null)
          .select()
          .single();
        if (retryError) {
          return { data: null, error: retryError, hadConflict: true };
        }
        hadConflict = true;
        return { data: retryData, error: null, hadConflict: true };
      }
      return { data: null, error: updateError, hadConflict: false };
    }
    return { data: updated, error: null, hadConflict: false };
  } catch (err) {
    return { data: null, error: err, hadConflict: false };
  }
}

/**
 * Permanently delete a single event from trash (hard delete).
 * Only deletes rows that are soft-deleted (deleted_at IS NOT NULL).
 */
export async function permanentlyDeleteTrashEvent(eventId, familyId) {
  if (!eventId || !familyId) {
    throw new Error('Event ID and Family ID are required');
  }
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('family_id', familyId)
    .not('deleted_at', 'is', null);

  if (error) {
    console.error('[permanentlyDeleteTrashEvent] Error:', error);
    throw new Error(error.message || 'Failed to permanently delete event');
  }
  return { success: true };
}

