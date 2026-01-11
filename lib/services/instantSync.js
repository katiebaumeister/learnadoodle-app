/**
 * Instant Sync Service
 * Provides optimistic updates and background sync for instant-feeling interactions
 */

import * as offlineStorage from './offlineStorage';
import { apiRequest } from '../apiClient';

let syncInProgress = false;
let syncListeners = new Set();

/**
 * Check if online
 */
function isOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
    return navigator.onLine;
  }
  return true; // Assume online if can't determine
}

/**
 * Add sync status listener
 */
export function addSyncListener(callback) {
  syncListeners.add(callback);
  return () => syncListeners.delete(callback);
}

/**
 * Notify sync listeners
 */
function notifyListeners(status) {
  syncListeners.forEach(callback => {
    try {
      callback(status);
    } catch (error) {
    }
  });
}

/**
 * Optimistically create an event
 */
export async function createEventOptimistic(event, familyId) {
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const optimisticEvent = {
    ...event,
    id: tempId,
    family_id: familyId,
    sync_status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Store locally immediately
  await offlineStorage.storeEvent(optimisticEvent, { sync_status: 'pending' });
  
  // Add to sync queue
  await offlineStorage.addToSyncQueue({
    operation: 'create',
    table_name: 'events',
    record_id: tempId,
    data: event,
    family_id: familyId,
  });

  // Try to sync immediately if online
  if (isOnline()) {
    syncEventInBackground(tempId, optimisticEvent).catch(error => {
    });
  }

  notifyListeners({ type: 'event_created', event: optimisticEvent });
  
  return optimisticEvent;
}

/**
 * Optimistically update an event
 */
export async function updateEventOptimistic(eventId, updates, familyId) {
  // Get current event
  const currentEvent = await offlineStorage.getEvent(eventId);
  if (!currentEvent) {
    throw new Error('Event not found');
  }

  const updatedEvent = {
    ...currentEvent,
    ...updates,
    sync_status: 'pending',
    updatedAt: new Date().toISOString(),
  };

  // Update locally immediately
  await offlineStorage.storeEvent(updatedEvent, { sync_status: 'pending' });
  
  // Add to sync queue
  await offlineStorage.addToSyncQueue({
    operation: 'update',
    table_name: 'events',
    record_id: eventId,
    data: updates,
    family_id: familyId,
  });

  // Try to sync immediately if online
  if (isOnline()) {
    syncEventInBackground(eventId, updatedEvent).catch(error => {
    });
  }

  notifyListeners({ type: 'event_updated', event: updatedEvent });
  
  return updatedEvent;
}

/**
 * Optimistically delete an event
 */
export async function deleteEventOptimistic(eventId, familyId) {
  // Mark as deleted locally
  const currentEvent = await offlineStorage.getEvent(eventId);
  if (currentEvent) {
    await offlineStorage.storeEvent({
      ...currentEvent,
      deleted: true,
      sync_status: 'pending',
    }, { sync_status: 'pending' });
  }

  // Add to sync queue
  await offlineStorage.addToSyncQueue({
    operation: 'delete',
    table_name: 'events',
    record_id: eventId,
    data: null,
    family_id: familyId,
  });

  // Try to sync immediately if online
  if (isOnline()) {
    syncDeleteInBackground(eventId, familyId).catch(error => {
    });
  }

  notifyListeners({ type: 'event_deleted', eventId });
  
  return { success: true };
}

/**
 * Sync event in background
 */
async function syncEventInBackground(eventId, event) {
  try {
    const isTemp = eventId.startsWith('temp_');
    const endpoint = isTemp ? '/api/events' : `/api/events/${eventId}`;
    const method = isTemp ? 'POST' : 'PUT';

    const { data, error } = await apiRequest(endpoint, {
      method,
      body: JSON.stringify(event),
    });

    if (error) {
      throw error;
    }

    // Update local storage with real ID and synced status
    if (isTemp && data && data.id) {
      await offlineStorage.removeEvent(eventId);
      await offlineStorage.storeEvent(data, { sync_status: 'synced' });
    } else {
      await offlineStorage.storeEvent(data || event, { sync_status: 'synced' });
    }

    // Remove from sync queue
    const queue = await offlineStorage.getSyncQueue('pending');
    const queueItem = queue.find(item => 
      item.table_name === 'events' && 
      (item.record_id === eventId || item.record_id === event.id)
    );
    if (queueItem) {
      await offlineStorage.updateSyncQueueItem(queueItem.id, { status: 'synced' });
    }

    notifyListeners({ type: 'event_synced', eventId: data?.id || eventId });
  } catch (error) {
    throw error;
  }
}

/**
 * Sync delete in background
 */
async function syncDeleteInBackground(eventId, familyId) {
  try {
    const { error } = await apiRequest(`/api/events/${eventId}`, {
      method: 'DELETE',
    });

    if (error) {
      throw error;
    }

    // Remove from local storage
    await offlineStorage.removeEvent(eventId);

    // Remove from sync queue
    const queue = await offlineStorage.getSyncQueue('pending');
    const queueItem = queue.find(item => 
      item.table_name === 'events' && item.record_id === eventId
    );
    if (queueItem) {
      await offlineStorage.removeSyncQueueItem(queueItem.id);
    }

    notifyListeners({ type: 'event_deleted_synced', eventId });
  } catch (error) {
    throw error;
  }
}

/**
 * Sync all pending changes
 */
export async function syncAllPending(familyId) {
  if (syncInProgress) {
    return { success: false, message: 'Sync already in progress' };
  }

  if (!isOnline()) {
    return { success: false, message: 'Offline' };
  }

  syncInProgress = true;
  notifyListeners({ type: 'sync_started' });

  try {
    const queue = await offlineStorage.getSyncQueue('pending');
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        if (item.table_name === 'events') {
          if (item.operation === 'create') {
            const event = await offlineStorage.getEvent(item.record_id);
            if (event) {
              await syncEventInBackground(item.record_id, event);
              synced++;
            }
          } else if (item.operation === 'update') {
            const event = await offlineStorage.getEvent(item.record_id);
            if (event) {
              await syncEventInBackground(item.record_id, event);
              synced++;
            }
          } else if (item.operation === 'delete') {
            await syncDeleteInBackground(item.record_id, item.family_id);
            synced++;
          }
        }
        // Add other table types as needed
      } catch (error) {
        failed++;
      }
    }

    // Also sync events with pending status
    const pendingEvents = await offlineStorage.getAllEvents(familyId);
    const filteredPending = pendingEvents.filter(e => e.sync_status === 'pending');

    for (const event of pendingEvents) {
      if (!event.deleted) {
        try {
          await syncEventInBackground(event.id, event);
          synced++;
        } catch (error) {
          failed++;
        }
      }
    }

    notifyListeners({ type: 'sync_completed', synced, failed });
    
    return { success: true, synced, failed };
  } catch (error) {
    notifyListeners({ type: 'sync_error', error: error.message });
    return { success: false, error: error.message };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Initialize background sync
 */
export function initBackgroundSync(familyId, intervalMs = 30000) {
  // Sync on online event
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      syncAllPending(familyId).catch(error => {
      });
    });

    // Periodic sync
    setInterval(() => {
      if (isOnline() && !syncInProgress) {
        syncAllPending(familyId).catch(error => {
        });
      }
    }, intervalMs);
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(familyId) {
  const status = await offlineStorage.getSyncStatus(familyId);
  return {
    ...status,
    isOnline: isOnline(),
    syncInProgress,
  };
}

