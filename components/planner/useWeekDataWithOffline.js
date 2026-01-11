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
  // CRITICAL LOG - This should appear EVERY time the hook is called
  if (typeof window !== 'undefined') {
    console.error('🔵🔵🔵 [useWeekDataWithOffline] HOOK INITIALIZED - VERSION WITH START_LOCAL FIX 🔵🔵🔵');
    console.error('🔵 Hook called with:', { 
      weekStart: weekStart?.toISOString?.(), 
      childIds, 
      familyId,
      hookFile: 'useWeekDataWithOffline.js'
    });
  }
  
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
      // CRITICAL LOG - This should appear when useEffect runs
      console.error('[useWeekData] 🎯🎯🎯 useEffect RUNNING 🎯🎯🎯', {
        familyId,
        weekStart: weekStart.toISOString(),
        childIds: childIds && childIds.length > 0 ? childIds : null,
        timestamp: new Date().toISOString()
      });
      
      if (!familyId) {
        console.log('[useWeekData] ⏭️ Skipping - no familyId');
        return;
      }
      
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
      
      // Log what's in cache
      if (cachedEvents.length > 0) {
        console.log('[useWeekData] 📦 Cached events retrieved:', {
          cachedCount: cachedEvents.length,
          sampleCachedEvent: cachedEvents[0] ? {
            id: cachedEvents[0].id,
            title: cachedEvents[0].title,
            hasStartLocal: !!cachedEvents[0].start_local,
            start_local: cachedEvents[0].start_local,
            allKeys: Object.keys(cachedEvents[0])
          } : null
        });
      }
      
      // Check if cached events have start_local (required for correct timezone display)
      // If cached events are missing start_local, they're from before the SQL fix
      // and we should skip the cache to force a fresh fetch
      const cachedEventsHaveStartLocal = cachedEvents.length > 0 && cachedEvents.some(e => e.start_local);
      
      // If cached events are missing start_local, clear them from cache to force fresh fetch
      if (cachedEvents.length > 0 && !cachedEventsHaveStartLocal) {
        console.warn('[useWeekData] ⚠️ Cached events missing start_local - clearing cache and fetching fresh:', {
          cachedEventsCount: cachedEvents.length,
          sampleEvent: cachedEvents[0] ? {
            id: cachedEvents[0].id,
            title: cachedEvents[0].title,
            hasStartLocal: !!cachedEvents[0].start_local
          } : null
        });
        
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
      
      // If we have cached events WITH start_local, use them immediately
      // BUT: Always fetch fresh data in background to ensure cache is up-to-date
      if (cachedEvents.length > 0 && cachedEventsHaveStartLocal && !weekChanged) {
        // Filter events by childIds if specified
        let filteredEvents = cachedEvents;
        if (childIds && childIds.length > 0) {
          filteredEvents = cachedEvents.filter(e => childIds.includes(e.child_id));
        }
        
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
        // Continue to fetch fresh data in background (don't return early)
      } else if (cachedEvents.length > 0 && !cachedEventsHaveStartLocal) {
        // Cached events are missing start_local - don't use them, wait for RPC
        console.warn('[useWeekData] ⚠️ Skipping cached events without start_local, waiting for RPC...');
      }
      
      // Fetch from API in background (or immediately if no cache)
      try {
        console.log('[useWeekData] 🔄 Calling get_week_view RPC:', {
          familyId,
          from,
          to,
          childIds: childIds && childIds.length > 0 ? childIds : null,
          hasCachedEvents: cachedEvents.length > 0
        });
        
        const { data: res, error } = await supabase.rpc('get_week_view', {
          _family_id: familyId,
          _from: from,
          _to: to,
          _child_ids: childIds && childIds.length > 0 ? childIds : null
        });

        console.log('[useWeekData] 📥 RPC call completed:', {
          hasData: !!res,
          hasError: !!error,
          error: error,
          eventsCount: res?.events?.length || 0,
          childrenCount: res?.children?.length || 0,
          availCount: res?.avail?.length || 0
        });
        
        // CRITICAL: Log raw RPC response to verify start_local is present
        if (res?.events?.length > 0) {
          const firstEvent = res.events[0];
          console.log('[useWeekData] 🔍 RAW RPC RESPONSE - First event:', {
            id: firstEvent.id,
            title: firstEvent.title,
            start_local: firstEvent.start_local,
            end_local: firstEvent.end_local,
            date_local: firstEvent.date_local,
            start_ts: firstEvent.start_ts,
            ALL_KEYS: Object.keys(firstEvent),
            RAW_OBJECT: firstEvent
          });
          
          if (!firstEvent.start_local) {
            console.error('[useWeekData] 🚨 CRITICAL: RPC is NOT returning start_local!', {
              eventId: firstEvent.id,
              title: firstEvent.title,
              availableKeys: Object.keys(firstEvent),
              note: 'The get_week_view RPC function needs to be updated. Run fix_get_week_view_ensure_start_local.sql'
            });
          }
        }

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
        
        // Debug: Check if start_local is in the RPC response
        if (typeof window !== 'undefined' && res?.events?.length > 0) {
          const sampleEvent = res.events[0];
          console.log('[useWeekData] ✅ RPC response received:', {
            eventsCount: res.events.length,
            sampleEvent: {
              id: sampleEvent.id,
              title: sampleEvent.title,
              hasStartLocal: !!sampleEvent.start_local,
              start_local: sampleEvent.start_local,
              hasDateLocal: !!sampleEvent.date_local,
              date_local: sampleEvent.date_local,
              start_ts: sampleEvent.start_ts,
              allKeys: Object.keys(sampleEvent).slice(0, 20)
            }
          });
          
          if (!sampleEvent.start_local) {
            console.error('[useWeekData] ❌ CRITICAL: start_local is missing from RPC response!', {
              eventId: sampleEvent.id,
              title: sampleEvent.title,
              availableKeys: Object.keys(sampleEvent),
              note: 'The get_week_view RPC function may not have been updated correctly. Please verify fix_get_week_view_ensure_start_local.sql ran successfully.'
            });
          }
        } else if (typeof window !== 'undefined') {
          console.warn('[useWeekData] ⚠️ RPC response has no events:', {
            hasRes: !!res,
            eventsCount: res?.events?.length || 0,
            error: error
          });
        }
        
        // Store events in offline storage
        if (res?.events && Array.isArray(res.events)) {
          console.log('[useWeekData] 💾 Storing events in IndexedDB:', {
            eventsCount: res.events.length,
            sampleEventBeforeStore: res.events[0] ? {
              id: res.events[0].id,
              title: res.events[0].title,
              hasStartLocal: !!res.events[0].start_local,
              start_local: res.events[0].start_local
            } : null
          });
          
          for (const event of res.events) {
            await offlineStorage.storeEvent({
              ...event,
              family_id: familyId,
            }, { sync_status: 'synced' });
          }
          
          // Verify what was stored by reading it back
          const storedEvent = await offlineStorage.getEvent(res.events[0]?.id);
          if (storedEvent) {
            console.log('[useWeekData] ✅ Verified stored event has start_local:', {
              id: storedEvent.id,
              title: storedEvent.title,
              hasStartLocal: !!storedEvent.start_local,
              start_local: storedEvent.start_local,
              allKeys: Object.keys(storedEvent)
            });
          }
        }
        
        // Always write a new object when updating state
        const eventsWithStartLocal = res?.events ? [...res.events] : [];
        const hasStartLocalInResponse = eventsWithStartLocal.length > 0 && eventsWithStartLocal.some(e => e.start_local);
        
        console.log('[useWeekData] 📊 Updating state:', {
          eventsCount: eventsWithStartLocal.length,
          hasStartLocal: hasStartLocalInResponse,
          sampleEvent: eventsWithStartLocal[0] ? {
            id: eventsWithStartLocal[0].id,
            title: eventsWithStartLocal[0].title,
            start_local: eventsWithStartLocal[0].start_local
          } : null
        });
        
        setData({
          children: res?.children ? [...res.children] : [],
          avail: res?.avail ? [...res.avail] : [],
          events: eventsWithStartLocal
        });
        
        if (shouldShowLoading) {
          setLoading(false);
        }
      } catch (err) {
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

