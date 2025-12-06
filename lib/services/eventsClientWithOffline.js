/**
 * Events Client with Offline Support
 * Wraps event operations with offline storage and instant sync
 */
import { apiRequest } from '../apiClient';
import * as offlineStorage from './offlineStorage';
import * as instantSync from './instantSync';

/**
 * Get events with offline support
 * Returns cached events immediately, then syncs in background
 */
export async function getEvents(familyId, dateRange = {}) {
  try {
    // Get from offline storage first
    const cachedEvents = await offlineStorage.getAllEvents(familyId, dateRange);
    
    // Return cached data immediately
    if (cachedEvents.length > 0) {
      // Sync in background (if online)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncEventsInBackground(familyId, dateRange).catch(err => {
          console.error('[eventsClientWithOffline] Background sync error:', err);
        });
      }
      
      return { data: cachedEvents, error: null };
    }

    // If no cache, fetch from API
    const params = new URLSearchParams();
    if (dateRange.start) params.append('start', dateRange.start);
    if (dateRange.end) params.append('end', dateRange.end);
    
    const url = `/api/events${params.toString() ? '?' + params.toString() : ''}`;
    const { data, error } = await apiRequest(url);

    if (error) {
      // Return cached data even if API fails
      return { data: cachedEvents, error: null };
    }

    // Store in offline storage
    if (data && Array.isArray(data)) {
      data.forEach(event => {
        offlineStorage.storeEvent({ ...event, family_id: familyId }, { sync_status: 'synced' });
      });
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('[eventsClientWithOffline] Error:', err);
    // Fallback to cached data
    const cached = await offlineStorage.getAllEvents(familyId, dateRange);
    return { data: cached, error: null };
  }
}

/**
 * Create event with optimistic update
 */
export async function createEvent(event, familyId) {
  return instantSync.createEventOptimistic(event, familyId);
}

/**
 * Update event with optimistic update
 */
export async function updateEvent(eventId, updates, familyId) {
  return instantSync.updateEventOptimistic(eventId, updates, familyId);
}

/**
 * Delete event with optimistic update
 */
export async function deleteEvent(eventId, familyId) {
  return instantSync.deleteEventOptimistic(eventId, familyId);
}

/**
 * Sync events in background
 */
async function syncEventsInBackground(familyId, dateRange) {
  try {
    const params = new URLSearchParams();
    if (dateRange.start) params.append('start', dateRange.start);
    if (dateRange.end) params.append('end', dateRange.end);
    
    const url = `/api/events${params.toString() ? '?' + params.toString() : ''}`;
    const { data, error } = await apiRequest(url);

    if (!error && data && Array.isArray(data)) {
      // Update offline storage
      for (const event of data) {
        await offlineStorage.storeEvent({ ...event, family_id: familyId }, { sync_status: 'synced' });
      }
    }
  } catch (err) {
    console.error('[eventsClientWithOffline] Background sync error:', err);
  }
}

