/**
 * useWeekDataWithOffline Hook
 * Enhanced version of useWeekData with offline storage and instant sync
 */
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import * as offlineStorage from '../../lib/services/offlineStorage';
import * as instantSync from '../../lib/services/instantSync';

// Helper to get local date string
function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function useWeekDataWithOffline(weekStart, childIds, familyId) {
  
  const [data, setData] = useState({ children: [], avail: [], events: [] });
  const [loading, setLoading] = useState(false);
  const prevWeekStartRef = useRef(weekStart.toISOString());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Listen for refresh events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleRefresh = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    
    window.addEventListener('refreshPlannerWeek', handleRefresh);
    return () => {
      window.removeEventListener('refreshPlannerWeek', handleRefresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!familyId) {
        return;
      }
      
      // Never show loading: update data in place so week view doesn't flash (user requested no loading state)
      const weekChanged = prevWeekStartRef.current !== weekStart.toISOString();
      const hasNoData = !data.children || data.children.length === 0;
      const isRefreshTrigger = refreshTrigger > 0;
      const shouldShowLoading = false;
      
      // Update the ref for next comparison
      prevWeekStartRef.current = weekStart.toISOString();
      
      // Use local date strings for date range
      const from = getLocalDateString(weekStart);
      const to = getLocalDateString(addDays(weekStart, 7));
      
      // Try to get from offline storage first
      const dateRange = {
        start_ts: weekStart.toISOString(),
        end_ts: addDays(weekStart, 7).toISOString(),
      };
      
      const cachedEventsRaw = await offlineStorage.getAllEvents(familyId, dateRange);
      const cachedEvents = (Array.isArray(cachedEventsRaw) ? cachedEventsRaw : []).filter((event) => {
        if (!event || typeof event !== 'object') return false;
        if (event.deleted_at) return false;
        const status = String(event.status || '').trim().toLowerCase();
        if (status === 'canceled' || status === 'cancelled') return false;
        return true;
      });
      
      // Check if cached events have start_local (required for correct timezone display)
      // If cached events are missing start_local, they're from before the SQL fix
      // and we should skip the cache to force a fresh fetch
      const cachedEventsHaveStartLocal = cachedEvents.length > 0 && cachedEvents.some(e => e.start_local);
      
      // If cached events are missing start_local, clear them from cache to force fresh fetch
      if (cachedEvents.length > 0 && !cachedEventsHaveStartLocal) {
        // Clear cached events for this date range to force fresh fetch
        // Delete each cached event that's missing start_local
        for (const event of cachedEvents) {
          if (!event.start_local) {
            try {
              await offlineStorage.removeEvent(event.id);
            } catch (err) {
              // Ignore errors - event might not exist
            }
          }
        }
        
        // Don't use cached events - wait for RPC response
        cachedEvents.length = 0; // Clear the array reference
      }
      
      // If this is a refresh trigger, skip cache and go straight to API
      // Otherwise, use cache if available while fetching fresh data in background
      if (isRefreshTrigger) {
        console.log('[useWeekDataWithOffline] Refresh triggered - skipping cache, fetching fresh data');
      }
      
      if (cachedEvents.length > 0 && !cachedEventsHaveStartLocal) {
        // Cached events are missing start_local - don't use them, wait for RPC
      }
      
      // Fetch from API in background (or immediately if no cache)
      try {
        const { data: res, error } = await supabase.rpc('get_week_view', {
          _family_id: familyId,
          _from: from,
          _to: to,
          _child_ids: childIds && childIds.length > 0 ? childIds : null
        });

        if (error) {
          
          // If we have cached data, keep using it
          if (cachedEvents.length > 0) {
            if (active) {
              setLoading(false);
            }
            return;
          }
          // No cache and API failed - show error state
          if (shouldShowLoading) {
            setLoading(false);
          }
          return;
        }
        
        if (!active) return;
        
        // Store events in offline storage
        if (res?.events && Array.isArray(res.events)) {
          for (const event of res.events) {
            await offlineStorage.storeEvent({
              ...event,
              family_id: familyId,
            }, { sync_status: 'synced' });
          }
        }
        
        // Always write a new object when updating state
        const eventsWithStartLocal = res?.events ? [...res.events] : [];
        
        // Force a new array reference to ensure React detects the change
        console.log('[useWeekDataWithOffline] Updating data with fresh events', {
          eventCount: eventsWithStartLocal.length,
          isRefreshTrigger,
          allEventIds: eventsWithStartLocal.map(e => ({ id: e.id, date_local: e.date_local, start_ts: e.start_ts })),
          sampleEventIds: eventsWithStartLocal.slice(0, 3).map(e => e.id)
        });
        
        setData({
          children: res?.children ? [...res.children] : [],
          avail: res?.avail ? [...res.avail] : [],
          events: [...eventsWithStartLocal] // Create new array reference
        });
        
        if (shouldShowLoading) {
          setLoading(false);
        }
      } catch (err) {
        // Fallback to cached data if available
        if (cachedEvents.length > 0 && active) {
          let filteredEvents = cachedEvents;
          if (childIds && childIds.length > 0) {
            filteredEvents = cachedEvents.filter(e => childIds.includes(e.child_id));
          }
          setData(prev => ({
            ...prev,
            events: filteredEvents,
          }));
        }
        if (shouldShowLoading) {
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [weekStart.toISOString(), JSON.stringify(childIds || []), familyId, refreshTrigger]);
  
  return { data, loading };
}

