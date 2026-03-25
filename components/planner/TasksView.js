import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet, Alert } from 'react-native';
import { Calendar, CalendarDays, List, Archive, Trash2, Plus, CheckCircle2, Circle } from 'lucide-react';
import { format, addDays, isToday, isSameDay, startOfToday } from './utils/date';
import EventChip from '../calendar/EventChip';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { supabase } from '../../lib/supabase';
import { permanentlyDeleteAllTrashEvents } from '../../lib/services/plannerClientWithOffline';

export default function TasksView({ 
  events = [], 
  onEventPress, 
  onEventRightClick, 
  onEventComplete,
  onCreateTask,
  children = [],
  familyId: familyIdProp = null,
  preloadedBacklogEvents = null,
  preloadedTrashEvents = null,
}) {
  const [activeSection, setActiveSection] = useState('today');
  const [userLists, setUserLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [backlogEvents, setBacklogEvents] = useState(() =>
    preloadedBacklogEvents != null ? preloadedBacklogEvents : [],
  );
  const [trashEvents, setTrashEvents] = useState(() =>
    preloadedTrashEvents != null ? preloadedTrashEvents : [],
  );

  const prevFamilyIdRef = useRef(undefined);
  useEffect(() => {
    if (!familyIdProp) return;
    if (prevFamilyIdRef.current !== undefined && prevFamilyIdRef.current !== familyIdProp) {
      setBacklogEvents([]);
      setTrashEvents([]);
    }
    prevFamilyIdRef.current = familyIdProp;
  }, [familyIdProp]);

  // Filter out deleted events from the events array (both client-side deleted flag and database deleted_at)
  // Also expand Project events to show on all days they span
  const nonDeletedEvents = useMemo(() => {
    const filtered = events.filter(ev => !ev.deleted && !ev.deleted_at);
    const expanded = [];
    const seenIds = new Set();
    
    for (const e of filtered) {
      if (!e || !e.id) continue;
      // Skip if we've already processed this original event
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      
      // Check if this is a Project event with start and end dates
      if (e.event_type === 'Project' && (e.start_ts || e.start || e.start_local) && (e.end_ts || e.end || e.end_local)) {
        const startTimestamp = e.start_ts || e.start || e.start_local;
        const endTimestamp = e.end_ts || e.end || e.end_local;
        const startDate = new Date(startTimestamp);
        const endDate = new Date(endTimestamp);
        
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          // Calculate days difference using date-only comparison (like MonthGrid does)
          // This ensures accurate day counting regardless of time components
          const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const daysDiff = Math.round((endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));
          
          // Expand multi-day Project events to show on each day they span (no limit on days)
          if (daysDiff > 0) {
            // Create a copy for each day from start to end (inclusive)
            for (let i = 0; i <= daysDiff; i++) {
              const dayDate = new Date(startDateOnly);
              dayDate.setDate(startDateOnly.getDate() + i);
              dayDate.setHours(0, 0, 0, 0); // Normalize to start of day
              
              // Create date_local string for consistency with month view
              const year = dayDate.getFullYear();
              const month = String(dayDate.getMonth() + 1).padStart(2, '0');
              const day = String(dayDate.getDate()).padStart(2, '0');
              const dateLocal = `${year}-${month}-${day}`;
              
              const expandedEvent = {
                ...e,
                id: `${e.id}-day-${i}`, // Unique ID for each day instance
                _originalId: e.id, // Keep reference to original
                _dayIndex: i,
                // Update start_ts, start, start_local, and date_local to the specific day
                start_ts: dayDate.toISOString(),
                start: dayDate.toISOString(),
                start_local: dayDate.toISOString(),
                date_local: dateLocal, // Also set date_local for consistency with month view
              };
              expanded.push(expandedEvent);
            }
            continue; // Skip adding the original event
          }
        }
      }
      
      // For non-Project events or single-day events, add as-is
      expanded.push(e);
    }
    
    return expanded;
  }, [events]);

  // Fetch deleted events for trash view
  const fetchTrashItems = useCallback(async () => {
    try {
      const familyIdFromEvents =
        familyIdProp ||
        events.find((e) => e.family_id || e.familyId)?.family_id ||
        events.find((e) => e.family_id || e.familyId)?.familyId;
      if (!familyIdFromEvents) return;

      let queryBuilder = supabase
        .from('events')
        .select('*')
        .not('deleted_at', 'is', null)
        .eq('family_id', familyIdFromEvents)
        .order('deleted_at', { ascending: false })
        .limit(100);

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('Error fetching trash items:', error);
        // Don't clear existing trashEvents on error - keep what we have
        return;
      }

      console.log('[TasksView] Fetched trash items:', data?.length || 0);
      setTrashEvents(data || []);
    } catch (error) {
      console.error('Error fetching trash items:', error);
      // Don't clear existing trashEvents on error - keep what we have
    }
  }, [familyIdProp, events]);

  const fetchBacklogItems = useCallback(async () => {
    try {
      const familyIdFromEvents =
        familyIdProp ||
        events.find((e) => e.family_id || e.familyId)?.family_id ||
        events.find((e) => e.family_id || e.familyId)?.familyId;
      if (!familyIdFromEvents) return;

      let queryBuilder = supabase
        .from('events')
        .select('*')
        .eq('is_backlog', true)
        .neq('status', 'done')
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .eq('family_id', familyIdFromEvents)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('Error fetching backlog items:', error);
        // Don't clear existing backlogEvents on error - keep what we have
        return;
      }

      console.log('[TasksView] Fetched backlog items:', data?.length || 0);
      setBacklogEvents(data || []);
    } catch (error) {
      console.error('Error fetching backlog items:', error);
      // Don't clear existing backlogEvents on error - keep what we have
    }
  }, [familyIdProp, events]);

  useEffect(() => {
    if (preloadedBacklogEvents != null) {
      setBacklogEvents(preloadedBacklogEvents);
    }
  }, [preloadedBacklogEvents]);

  useEffect(() => {
    if (preloadedTrashEvents != null) {
      setTrashEvents(preloadedTrashEvents);
    }
  }, [preloadedTrashEvents]);

  // Fetch backlog items when backlog section is active
  // Also preload when component mounts to make switching faster
  useEffect(() => {
    if (activeSection === 'backlog') {
      // Fetch immediately when backlog section is active
      fetchBacklogItems();
    } else if (activeSection === 'trash') {
      // Fetch immediately when trash section is active
      fetchTrashItems();
    }
    // Don't clear backlogEvents/trashEvents when switching away - keep them cached for faster switching back
  }, [activeSection, fetchBacklogItems, fetchTrashItems]);

  useEffect(() => {
    fetchBacklogItems();
    fetchTrashItems();
  }, [fetchBacklogItems, fetchTrashItems]);

  // Listen for calendar refresh events to refetch backlog items
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleRefresh = () => {
      if (activeSection === 'backlog') {
        fetchBacklogItems();
      }
    };

    // Listen for event deletion - remove from backlogEvents and add to trashEvents
    const handleEventDeleted = (event) => {
      const deletedId = event.detail?.eventId || event.detail?.id;
      if (deletedId) {
        // Remove from backlogEvents immediately
        setBacklogEvents(prev => prev.filter(ev => ev.id !== deletedId));
        // Also filter out any canceled events that might have been soft-deleted
        setBacklogEvents(prev => prev.filter(ev => {
          const status = ev.status || ev.data?.status;
          return status !== 'canceled';
        }));
      }
      // Also refetch to ensure consistency
      if (activeSection === 'backlog') {
        // Small delay to ensure database has updated
        setTimeout(() => {
          fetchBacklogItems();
        }, 300);
      } else if (activeSection === 'trash') {
        // Refetch trash items when an event is deleted
        setTimeout(() => {
          fetchTrashItems();
        }, 300);
      }
    };

    // Listen for new event creation - refetch backlog if we're on backlog view
    const handleEventCreated = () => {
      if (activeSection === 'backlog') {
        // Small delay to ensure the database has been updated
        setTimeout(() => {
          fetchBacklogItems();
        }, 500);
      }
    };

    // When an item is restored from trash or permanently deleted, remove from list
    const handleTrashItemRestored = (event) => {
      const eventId = event.detail?.eventId;
      if (eventId) {
        setTrashEvents(prev => prev.filter(ev => ev.id !== eventId));
      }
    };

    window.addEventListener('refreshCalendar', handleRefresh);
    window.addEventListener('eventRescheduled', handleRefresh);
    window.addEventListener('eventDeleted', handleEventDeleted);
    window.addEventListener('eventCreated', handleEventCreated);
    window.addEventListener('trashItemRestored', handleTrashItemRestored);

    return () => {
      window.removeEventListener('refreshCalendar', handleRefresh);
      window.removeEventListener('eventRescheduled', handleRefresh);
      window.removeEventListener('eventDeleted', handleEventDeleted);
      window.removeEventListener('eventCreated', handleEventCreated);
      window.removeEventListener('trashItemRestored', handleTrashItemRestored);
    };
  }, [activeSection, fetchBacklogItems, fetchTrashItems]);

  // Get familyId from events, trashEvents, or fetch from profile
  const [fetchedFamilyId, setFetchedFamilyId] = useState(null);
  
  // Check if we have familyId from events or trashEvents
  const familyIdFromEvents = useMemo(() => {
    // First try to get from trashEvents (they're fetched from DB and should have family_id)
    const fromTrash = trashEvents.find(e => e.family_id || e.familyId)?.family_id || trashEvents.find(e => e.family_id || e.familyId)?.familyId;
    if (fromTrash) return fromTrash;
    
    // Fall back to events
    return events.find(e => e.family_id || e.familyId)?.family_id || events.find(e => e.family_id || e.familyId)?.familyId;
  }, [events, trashEvents]);
  
  const familyId = familyIdProp || familyIdFromEvents || fetchedFamilyId;

  // Fetch familyId from profile if not found in events
  useEffect(() => {
    if (!familyIdFromEvents && !fetchedFamilyId && Platform.OS === 'web') {
      const fetchFamilyIdFromProfile = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .single();

          if (profile?.family_id) {
            setFetchedFamilyId(profile.family_id);
          }
        } catch (error) {
          console.error('[TasksView] Error fetching family ID from profile:', error);
        }
      };
      fetchFamilyIdFromProfile();
    }
  }, [familyIdFromEvents, fetchedFamilyId]);

  // Listen for section changes from external sources (e.g., search results)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Check URL parameter for section on mount
      const urlParams = new URLSearchParams(window.location.search);
      const sectionParam = urlParams.get('section');
      if (sectionParam && ['today', 'tomorrow', 'next2weeks', 'backlog', 'completed', 'trash'].includes(sectionParam)) {
        setActiveSection(sectionParam);
        setSelectedList(null);
      }

      // Listen for custom event to change section
      const handleSectionChange = (event) => {
        const section = event.detail?.section;
        if (section && ['today', 'tomorrow', 'next2weeks', 'backlog', 'completed', 'trash'].includes(section)) {
          setActiveSection(section);
          setSelectedList(null);
        }
      };

      window.addEventListener('plannerTasksViewChange', handleSectionChange);

      return () => {
        window.removeEventListener('plannerTasksViewChange', handleSectionChange);
      };
    }
  }, []);

  // Handle permanently deleting all trash events
  const handlePermanentlyClearTrash = useCallback(async () => {
    if (!familyId) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Unable to clear trash: Family ID not found');
      } else {
        Alert.alert('Error', 'Unable to clear trash: Family ID not found');
      }
      return;
    }

    const trashCount = trashEvents.length;
    if (trashCount === 0) {
      return;
    }

    // Confirmation dialog
    const confirmMessage = `Are you sure you want to permanently delete all ${trashCount} item${trashCount === 1 ? '' : 's'} in trash? This action cannot be undone.`;
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    } else {
      // For native, Alert.alert doesn't return a promise, so we handle it in the button callbacks
      Alert.alert(
        'Clear Trash',
        confirmMessage,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete Forever',
            style: 'destructive',
            onPress: async () => {
              // Perform deletion in the button callback
              try {
                const result = await permanentlyDeleteAllTrashEvents(familyId);
                
                if (result.success) {
                  setTrashEvents([]);
                  
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('refreshCalendar'));
                  }
                }
              } catch (error) {
                console.error('[TasksView] Error clearing trash:', error);
                const errorMessage = error.message || 'Unknown error';
                Alert.alert('Error', `Failed to clear trash: ${errorMessage}`);
              }
            }
          }
        ],
        { cancelable: true }
      );
      return;
    }

    // Perform the deletion
    try {
      const result = await permanentlyDeleteAllTrashEvents(familyId);
      
      if (result.success) {
        // Clear trash events from state
        setTrashEvents([]);
        
        // Clear calendar cache to refresh views
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      }
    } catch (error) {
      console.error('[TasksView] Error clearing trash:', error);
      const errorMessage = error.message || 'Unknown error';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Failed to clear trash: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to clear trash: ${errorMessage}`);
      }
    }
  }, [familyId, trashEvents.length]);

  // Filter events by section
  // Note: events are already expanded in nonDeletedEvents, so we filter based on the expanded event's start_ts
  const getFilteredEvents = (section) => {
    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    const twoWeeksFromNow = addDays(today, 14);
    // Use nonDeletedEvents instead of events (nonDeletedEvents already includes expanded Project events)
    const eventsToFilter = nonDeletedEvents || events;
    
    switch (section) {
      case 'today':
        return eventsToFilter.filter(ev => {
          // Exclude backlog items and soft-deleted events from today view
          if (ev.is_backlog === true) return false;
          if (ev.deleted || ev.deleted_at) return false;
          if (ev.status === 'done') return false;
          const evDate = ev.start || ev.start_ts || ev.start_local;
          if (!evDate) return false;
          const d = new Date(evDate);
          // For expanded events, the start_ts is already set to the specific day, so we just check if it's today
          return isToday(d);
        });
      
      case 'tomorrow':
        return eventsToFilter.filter(ev => {
          // Exclude backlog items and soft-deleted events from tomorrow view
          if (ev.is_backlog === true) return false;
          if (ev.deleted || ev.deleted_at) return false;
          if (ev.status === 'done') return false;
          const evDate = ev.start || ev.start_ts || ev.start_local;
          if (!evDate) return false;
          const d = new Date(evDate);
          // For expanded events, the start_ts is already set to the specific day, so we just check if it's tomorrow
          return isSameDay(d, tomorrow);
        });
      
      case 'next2weeks':
        return eventsToFilter.filter(ev => {
          // Exclude backlog items and soft-deleted events from next 2 weeks view
          if (ev.is_backlog === true) return false;
          if (ev.deleted || ev.deleted_at) return false;
          if (ev.status === 'done') return false;
          const evDate = ev.start || ev.start_ts || ev.start_local;
          if (!evDate) return false;
          const d = new Date(evDate);
          // Normalize dates to start of day for comparison
          d.setHours(0, 0, 0, 0);
          const todayNormalized = new Date(today);
          todayNormalized.setHours(0, 0, 0, 0);
          const twoWeeksFromNowNormalized = new Date(twoWeeksFromNow);
          twoWeeksFromNowNormalized.setHours(23, 59, 59, 999);
          // For expanded events, the start_ts is already set to the specific day, so we check if it's in range
          return d >= todayNormalized && d <= twoWeeksFromNowNormalized;
        });
      
      case 'backlog':
        // For backlog, use the separately fetched backlogEvents
        // Also check regular events in case any backlog items are there (using is_backlog field)
        const regularBacklog = eventsToFilter.filter(ev => {
          return ev.is_backlog === true && ev.status !== 'done' && !ev.deleted && !ev.deleted_at;
        });
        // Combine fetched backlog events with any found in regular events
        const allBacklog = [...backlogEvents, ...regularBacklog];
        // Remove duplicates by id
        const uniqueBacklog = allBacklog.filter((ev, index, self) => 
          index === self.findIndex(e => e.id === ev.id)
        );
        return uniqueBacklog;
      
      case 'completed':
        return eventsToFilter
          .filter(ev => ev.status === 'done' && !ev.deleted && !ev.deleted_at)
          .sort((a, b) => {
            const aDate = a.start || a.start_ts || a.start_local;
            const bDate = b.start || b.start_ts || b.start_local;
            
            // Events without dates go to the end
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            
            const dateA = new Date(aDate);
            const dateB = new Date(bDate);
            
            // Invalid dates go to the end
            if (Number.isNaN(dateA.getTime()) && Number.isNaN(dateB.getTime())) return 0;
            if (Number.isNaN(dateA.getTime())) return 1;
            if (Number.isNaN(dateB.getTime())) return -1;
            
            // Sort from newest to oldest (descending order)
            return dateB.getTime() - dateA.getTime();
          });
      
      case 'trash':
        // For trash, use the separately fetched trashEvents
        // Also check regular events in case any deleted items are there (using deleted_at field)
        const regularTrash = eventsToFilter.filter(ev => {
          return ev.deleted_at != null || ev.deleted;
        });
        // Combine fetched trash events with any found in regular events
        const allTrash = [...trashEvents, ...regularTrash];
        // Remove duplicates by id
        const uniqueTrash = allTrash.filter((ev, index, self) => 
          index === self.findIndex(e => e.id === ev.id)
        );
        return uniqueTrash;
      
      default:
        if (selectedList && section === selectedList.id) {
          // Filter by user list (would need list assignment logic)
          return eventsToFilter.filter(ev => !ev.completed && !ev.deleted);
        }
        return [];
    }
  };

  const currentEvents = useMemo(() => {
    const filtered = getFilteredEvents(activeSection);
    // For trash view, we want deleted events, so don't filter them out
    if (activeSection === 'trash') {
      return filtered;
    }
    // For other views, filter out any deleted events that might have slipped through
    return filtered.filter(ev => !ev.deleted && !ev.deleted_at);
  }, [activeSection, nonDeletedEvents, selectedList, backlogEvents, trashEvents]);

  // Trash display: group plan placeholder events into one row per plan; other events stay as single rows
  const trashDisplayItems = useMemo(() => {
    if (activeSection !== 'trash') return [];
    const planGroups = {};
    const singles = [];
    for (const ev of trashEvents) {
      if (ev.generated_by === 'plan_year' && ev.academic_year_id) {
        const id = ev.academic_year_id;
        if (!planGroups[id]) planGroups[id] = { events: [], label: null };
        planGroups[id].events.push(ev);
        if (!planGroups[id].label) {
          const t = (ev.title || '').trim();
          planGroups[id].label = t.replace(/\s*Placeholder\s*$/i, '').trim() || 'Plan';
        }
      } else {
        singles.push(ev);
      }
    }
    const items = [];
    for (const ev of singles) items.push({ type: 'event', event: ev });
    for (const id of Object.keys(planGroups)) {
      const g = planGroups[id];
      const deletedAt = g.events.length ? g.events.reduce((max, e) => {
        const d = e.deleted_at ? new Date(e.deleted_at).getTime() : 0;
        return d > max ? d : max;
      }, 0) : 0;
      const dates = g.events.map((e) => {
        const t = e.start_ts || e.start || e.start_local;
        return t ? new Date(t) : null;
      }).filter(Boolean);
      const dateMin = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
      const dateMax = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
      const childIds = [...new Set(g.events.flatMap((e) => (e.child_id ? [e.child_id] : (e.child_ids && Array.isArray(e.child_ids) ? e.child_ids : []))))];
      items.push({
        type: 'plan',
        academicYearId: id,
        label: g.label,
        count: g.events.length,
        deletedAt,
        eventIds: g.events.map((e) => e.id),
        dateRangeStart: dateMin,
        dateRangeEnd: dateMax,
        childIds,
      });
    }
    items.sort((a, b) => {
      const da = a.type === 'plan' ? a.deletedAt : (a.event.deleted_at ? new Date(a.event.deleted_at).getTime() : 0);
      const db = b.type === 'plan' ? b.deletedAt : (b.event.deleted_at ? new Date(b.event.deleted_at).getTime() : 0);
      return db - da;
    });
    return items;
  }, [activeSection, trashEvents]);

  const handleOpenEditPlan = (academicYearId) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openPlanYearModal', {
        detail: { from: 'trash', academicYearId },
      }));
    }
  };

  const formatPlanDateRange = (start, end) => {
    if (!start || !end) return null;
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const startStr = fmt(start);
    const endStr = fmt(end);
    return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
  };

  const renderPlanTrashItem = (item) => {
    const dateRangeStr = formatPlanDateRange(item.dateRangeStart, item.dateRangeEnd);
    return (
      <TouchableOpacity
        key={`plan-${item.academicYearId}`}
        style={styles.taskItem}
        onPress={() => handleOpenEditPlan(item.academicYearId)}
        activeOpacity={0.7}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <View style={styles.planTrashRow}>
          <View style={{ marginRight: 10 }}>
            <Calendar size={16} color="#6B7280" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.planTrashLabel}>Plan: {item.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {dateRangeStr ? (
                <Text style={styles.planTrashMeta}>{dateRangeStr}</Text>
              ) : null}
              <Text style={styles.planTrashMeta}>
                {item.count} lesson{item.count === 1 ? '' : 's'}
              </Text>
              {item.childIds && item.childIds.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {item.childIds.map((cid) => {
                    const child = children.find((c) => c.id === cid);
                    const dotColor = child?.avatar ? getChildColorFromAvatar(child.avatar) : '#9CA3AF';
                    return (
                      <View
                        key={cid}
                        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaskItem = (event) => {
    // Add active section metadata to the event object so the handler knows we're in trash
    const eventWithSection = { ...event, _activeSection: activeSection };
    
    return (
      <View key={event.id} style={styles.taskItem}>
        <EventChip
          ev={eventWithSection}
          compact={true}
          fullWidth={true}
          hideTime={false}
          onPress={activeSection === 'trash' ? undefined : (() => onEventPress && onEventPress(event))}
          onRightClick={onEventRightClick ? (ev, nativeEvent) => {
            onEventRightClick(ev, nativeEvent);
          } : undefined}
          onComplete={() => onEventComplete && onEventComplete(event)}
          showCheckmark={true}
          children={children}
          alignDotsNearTime={true}
          titleFontSize={14}
          timeFontSize={12}
          showDate={true}
          hideDoneStyling={activeSection === 'completed' || activeSection === 'trash'}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <ScrollView style={styles.sidebarScroll}>
          {/* Primary Views */}
          <View style={styles.sidebarSection}>
            <TouchableOpacity
              style={[styles.sidebarItem, activeSection === 'today' && styles.sidebarItemActive]}
              onPress={() => {
                setActiveSection('today');
                setSelectedList(null);
              }}
            >
              <Text style={[
                styles.sidebarItemText,
                activeSection === 'today' && styles.sidebarItemTextActive
              ]}>
                Today
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, activeSection === 'tomorrow' && styles.sidebarItemActive]}
              onPress={() => {
                setActiveSection('tomorrow');
                setSelectedList(null);
              }}
            >
              <Text style={[
                styles.sidebarItemText,
                activeSection === 'tomorrow' && styles.sidebarItemTextActive
              ]}>
                Tomorrow
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, activeSection === 'next2weeks' && styles.sidebarItemActive]}
              onPress={() => {
                setActiveSection('next2weeks');
                setSelectedList(null);
              }}
            >
              <Text style={[
                styles.sidebarItemText,
                activeSection === 'next2weeks' && styles.sidebarItemTextActive
              ]}>
                Next 2 Weeks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, activeSection === 'backlog' && styles.sidebarItemActive]}
              onPress={() => {
                setActiveSection('backlog');
                setSelectedList(null);
              }}
            >
              <Text style={[
                styles.sidebarItemText,
                activeSection === 'backlog' && styles.sidebarItemTextActive
              ]}>
                Backlog
              </Text>
            </TouchableOpacity>
          </View>

          {/* User Lists */}
          {userLists.length > 0 && (
            <View style={styles.sidebarSection}>
              {userLists.map(list => (
                <TouchableOpacity
                  key={list.id}
                  style={[
                    styles.sidebarItem,
                    selectedList?.id === list.id && styles.sidebarItemActive
                  ]}
                  onPress={() => {
                    setActiveSection(list.id);
                    setSelectedList(list);
                  }}
                >
                  <Text style={styles.listIcon}>{list.icon}</Text>
                  <Text style={[
                    styles.sidebarItemText,
                    selectedList?.id === list.id && styles.sidebarItemTextActive
                  ]}>
                    {list.name}
                  </Text>
                  {list.count > 0 && (
                    <Text style={styles.listCount}>{list.count}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* System Views */}
          <View style={styles.sidebarSection}>
            <TouchableOpacity
              style={[styles.sidebarItem, activeSection === 'completed' && styles.sidebarItemActive]}
              onPress={() => {
                setActiveSection('completed');
                setSelectedList(null);
              }}
            >
              <Text style={[
                styles.sidebarItemText,
                activeSection === 'completed' && styles.sidebarItemTextActive
              ]}>
                Completed
              </Text>
            </TouchableOpacity>

            {/* Trash view hidden for now - sidebar entry removed */}
          </View>
        </ScrollView>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {activeSection === 'today' && 'Today'}
            {activeSection === 'tomorrow' && 'Tomorrow'}
            {activeSection === 'next2weeks' && 'Next 2 Weeks'}
            {activeSection === 'backlog' && 'Backlog'}
            {activeSection === 'completed' && 'Completed'}
            {activeSection === 'trash' && 'Trash'}
            {selectedList && selectedList.name}
          </Text>
          {activeSection === 'backlog' && (
            <Text style={styles.headerDescription}>
              Keep backburner items here. Add them to the calendar any time.
            </Text>
          )}
        </View>

        {/* Add Task Input or Clear Trash Button */}
        {activeSection === 'trash' && trashEvents.length > 0 ? (
          <TouchableOpacity
            style={[styles.addTaskInput, styles.clearTrashButton]}
            onPress={handlePermanentlyClearTrash}
          >
            <Trash2 size={18} color="#dc2626" />
            <Text style={[styles.addTaskText, styles.clearTrashText]}>
              Clear Trash ({trashEvents.length})
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.addTaskInput}
            onPress={() => {
              // Pass the active section so the modal can default to backlog if we're on backlog tab
              if (onCreateTask) {
                onCreateTask(activeSection === 'backlog' ? 'backlog' : 'calendar');
              }
            }}
          >
            <Plus size={18} color="#9CA3AF" />
            <Text style={styles.addTaskText}>
              Add task
            </Text>
          </TouchableOpacity>
        )}

        {/* Tasks List */}
        <ScrollView style={styles.tasksList}>
            {activeSection === 'trash' ? (
              trashDisplayItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No tasks in trash</Text>
                </View>
              ) : (
                trashDisplayItems.map((item) =>
                  item.type === 'event' ? renderTaskItem(item.event) : renderPlanTrashItem(item)
                )
              )
            ) : currentEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No tasks {activeSection === 'today' ? 'today' : activeSection === 'completed' ? 'completed' : 'here'}
                </Text>
              </View>
            ) : (
              currentEvents.map(renderTaskItem)
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },
  sidebar: {
    width: 200,
    backgroundColor: 'transparent',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  sidebarScroll: {
    flex: 1,
    paddingVertical: 16,
  },
  sidebarSection: {
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  sidebarSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 0,
    marginBottom: 0,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.15s ease',
      cursor: 'pointer',
    }),
  },
  sidebarItemActive: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 0,
  },
  sidebarItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em',
    }),
  },
  sidebarItemTextActive: {
    color: 'rgba(167, 139, 250, 0.9)',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em',
    }),
  },
  listIcon: {
    fontSize: 18,
  },
  listCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  mainContent: {
    flex: 1,
    padding: 24,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 20,
  },
  addTaskInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  addTaskText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearTrashButton: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  clearTrashText: {
    color: '#dc2626',
    fontWeight: '600',
  },
  tasksList: {
    flex: 1,
  },
  taskItem: {
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  planTrashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  planTrashLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planTrashMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  comingSoonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    minHeight: 200,
  },
  comingSoonText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});

