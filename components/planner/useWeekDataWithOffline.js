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
      console.log('[useWeekDataWithOffline] Refresh event received, triggering refetch');
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
      
      // Use local date strings for date range
      const from = getLocalDateString(weekStart);
      const to = getLocalDateString(addDays(weekStart, 7));
      
      // Try to get from offline storage first
      const dateRange = {
        start_ts: weekStart.toISOString(),
        end_ts: addDays(weekStart, 7).toISOString(),
      };
      
      const cachedEvents = await offlineStorage.getAllEvents(familyId, dateRange);
      
      // If we have cached events, use them immediately
      if (cachedEvents.length > 0 && !weekChanged) {
        // Filter events by childIds if specified
        let filteredEvents = cachedEvents;
        if (childIds && childIds.length > 0) {
          filteredEvents = cachedEvents.filter(e => childIds.includes(e.child_id));
        }
        
        // Get children and availability from cache or API
        // For now, we'll still fetch these from API as they change less frequently
        // But we can optimize this later
        
        // Return cached events immediately
        if (active) {
          setData(prev => ({
            ...prev,
            events: filteredEvents,
          }));
          if (shouldShowLoading) {
            setLoading(false);
          }
        }
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
          console.error('get_week_view error', error);
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
        setData({
          children: res?.children ? [...res.children] : [],
          avail: res?.avail ? [...res.avail] : [],
          events: res?.events ? [...res.events] : []
        });
        
        if (shouldShowLoading) {
          setLoading(false);
        }
      } catch (err) {
        console.error('[useWeekDataWithOffline] Error:', err);
        // Fallback to cached data if available
        if (cachedEvents.length > 0 && active) {
          setData(prev => ({
            ...prev,
            events: cachedEvents,
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

