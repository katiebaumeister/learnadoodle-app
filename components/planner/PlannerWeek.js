import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar, Sparkles, List } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import DraggableEvent from './DraggableEvent';
// Re-enabling step by step
import BacklogDrawer from './BacklogDrawer';
import PeriodSwitcher from './PeriodSwitcher';
import AIActions from './AIActions';
import RescheduleReportModal from './RescheduleReportModal';

// Helper functions
function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
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

function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Custom hook for week data
function useWeekData(weekStart, childIds, familyId) {
  const [data, setData] = useState({ children: [], avail: [], events: [] });
  const [loading, setLoading] = useState(false);
  const prevWeekStartRef = useRef(weekStart.toISOString());

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
      
      const from = weekStart.toISOString().slice(0, 10);
      const to = addDays(weekStart, 7).toISOString().slice(0, 10);
      
      // Debug: Log what we're sending to RPC
      console.log('get_week_view call:', {
        _family_id: familyId,
        _from: from,
        _to: to,
        _child_ids: childIds || null,
        childIdsType: Array.isArray(childIds) ? 'array' : typeof childIds,
        childIdsLength: Array.isArray(childIds) ? childIds.length : 'N/A'
      });
      
      const { data: res, error } = await supabase.rpc('get_week_view', {
        _family_id: familyId,
        _from: from,
        _to: to,
        _child_ids: childIds && childIds.length > 0 ? childIds : null
      });

      if (error) {
        console.error('get_week_view error', error);
        if (shouldShowLoading) {
          setLoading(false);
        }
        return;
      }
      if (!active) return;
      
      // Debug: Log what we're getting from the RPC
      console.log('get_week_view response:', res);
      console.log('Filtered events count:', res?.events?.length || 0);
      console.log('Event child_ids:', res?.events?.map(e => e.child_id) || []);
      console.log('Selected childIds:', childIds);
      
      setData(res || { children: [], avail: [], events: [] });
      if (shouldShowLoading) {
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [weekStart.toISOString(), JSON.stringify(childIds || []), familyId]);

  return { data, loading };
}

// Day Column Component
function DayColumn({ date, hours, windows, events, onAdd, onEventChanged }) {
  const total = hours.endMin - hours.startMin;
  const step = hours.step;

  return (
    <View style={styles.dayColumn}>
      {/* Hour lines */}
      {Array.from({ length: Math.floor(total / step) + 1 }).map((_, i) => {
        const y = (i * step / total) * 100;
        return (
          <View
            key={i}
            style={[styles.hourLine, { top: `${y}%` }]}
          />
        );
      })}

      {/* Availability windows */}
      {windows.map((w, idx) => {
        const s = ((minutesSinceMidnight(w.start) - hours.startMin) / total) * 100;
        const e = ((minutesSinceMidnight(w.end) - hours.startMin) / total) * 100;
        const h = Math.max(2, e - s);
        return (
          <View
            key={idx}
            style={[
              styles.availWindow,
              { top: `${s}%`, height: `${h}%` }
            ]}
          />
        );
      })}

      {/* Events - Now Draggable */}
      {events.map(ev => {
        return (
          <DraggableEvent
            key={ev.id}
            ev={ev}
            dayStartMin={hours.startMin}
            dayEndMin={hours.endMin}
            totalMin={total}
            onChanged={(patched) => onEventChanged(ev.id, patched)}
          />
        );
      })}

      {/* Click to add overlay */}
      <TouchableOpacity
        style={styles.addOverlay}
        onPress={() => {
          const startMin = Math.round(hours.startMin + 9 * 60); // Default to 9 AM
          onAdd(startMin);
        }}
        activeOpacity={1}
      />
    </View>
  );
}

export default function PlannerWeek({ familyId, onAddActivity, onOpenAIPlanner, selectedChildIds, onChildFilterChange, onViewChange }) {
  console.log('PlannerWeek rendered:', { familyId, selectedChildIds });
  
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [localEvents, setLocalEvents] = useState({}); // Optimistic updates
  const [showBacklog, setShowBacklog] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('this-week');
  const [rescheduleReport, setRescheduleReport] = useState(null);
  const [allChildren, setAllChildren] = useState([]); // Complete list for filter UI
  
  const { data, loading } = useWeekData(weekStart, selectedChildIds, familyId);
  
  console.log('PlannerWeek data:', { data, loading, selectedChildIds });

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

  // Listen for a global event to open the backlog drawer
  useEffect(() => {
    const handler = () => {
      setShowBacklog(true);
      // Clear the sessionStorage flag
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('openBacklogDrawer');
      }
    };
    
    if (typeof window !== 'undefined') {
      // Check sessionStorage on mount (in case event fired before component mounted)
      if (sessionStorage.getItem('openBacklogDrawer') === 'true') {
        handler();
      }
      
      // Also listen for the event
      window.addEventListener('openBacklogDrawer', handler);
      return () => window.removeEventListener('openBacklogDrawer', handler);
    }
  }, []);

  // Handle event updates (optimistic + refetch on error)
  const handleEventChanged = (eventId, patched) => {
    if (patched === null) {
      // Error occurred, refetch
      setLocalEvents({});
      // Trigger refetch by updating weekStart slightly
      setWeekStart(new Date(weekStart));
    } else {
      // Optimistic update
      setLocalEvents(prev => ({ ...prev, [eventId]: patched }));
    }
  };

  const handlePeriodChange = (period, dates) => {
    setCurrentPeriod(period);
    // Convert Luxon DateTime to JS Date
    const startDate = dates.start.toJSDate ? dates.start.toJSDate() : new Date(dates.start);
    setWeekStart(startDate);
  };

  const handlePackThisWeek = async () => {
    // TODO: Implement AI packing logic
    alert('Pack This Week - AI endpoint coming soon!');
  };

  const handleRebalance4Weeks = async () => {
    // TODO: Implement AI rebalance logic
    alert('Rebalance 4 Weeks - AI endpoint coming soon!');
  };

  const handleWhatIf = async () => {
    // TODO: Implement what-if modal
    alert('What-if Analysis - Coming soon!');
  };

  const handleBacklogDragStart = (item) => {
    console.log('Dragging backlog item:', item);
    // TODO: Set drag state for drop zones
  };
  
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const hours = { startMin: 8 * 60, endMin: 17 * 60, step: 60 };

  // Index avail/events by date
  const availByDate = {};
  const eventsByDate = {};
  
  // Ensure data.avail and data.events are arrays
  const availData = Array.isArray(data.avail) ? data.avail : [];
  const eventsData = Array.isArray(data.events) ? data.events : [];
  
  // Debug: Log filtering
  console.log('Client-side filtering:', {
    selectedChildIds,
    availDataCount: availData.length,
    eventsDataCount: eventsData.length,
    sampleEventIds: eventsData.slice(0, 3).map(e => ({ id: e.id, child_id: e.child_id }))
  });
  
  const filtAvail = availData.filter(a => 
    selectedChildIds === null || selectedChildIds.length === 0 || selectedChildIds.includes(a.child_id)
  );
  const filtEvents = eventsData.filter(e => 
    selectedChildIds === null || selectedChildIds.length === 0 || selectedChildIds.includes(e.child_id)
  );
  
  console.log('After filtering:', {
    filtAvailCount: filtAvail.length,
    filtEventsCount: filtEvents.length
  });
  
  for (const a of filtAvail) {
    // Handle windows as JSONB - ensure it's an array before spreading
    const windows = a.windows;
    if (Array.isArray(windows)) {
      (availByDate[a.date] = availByDate[a.date] || []).push(...windows);
    } else if (windows && typeof windows === 'object') {
      // If it's a JSONB object, convert to array
      const windowsArray = Array.isArray(windows) ? windows : [windows];
      (availByDate[a.date] = availByDate[a.date] || []).push(...windowsArray);
    }
  }
  
  for (const e of filtEvents) {
    // Use local optimistic update if available
    const event = localEvents[e.id] || e;
    // Use date_local from RPC if available (already in family timezone), otherwise fallback to parsing start_ts
    let d;
    if (event.date_local) {
      d = event.date_local; // Already a date string in YYYY-MM-DD format
    } else if (event.start_local_ts) {
      d = new Date(event.start_local_ts).toISOString().slice(0, 10);
    } else {
      d = new Date(event.start_ts).toISOString().slice(0, 10);
    }
    (eventsByDate[d] = eventsByDate[d] || []).push(event);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading week...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* View Toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={styles.viewToggleButton}
              onPress={() => onViewChange?.('month')}
            >
              <Text style={styles.viewToggleText}>Month</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleButton, styles.viewToggleButtonActive]}
              onPress={() => onViewChange?.('week')}
            >
              <Text style={[styles.viewToggleText, styles.viewToggleTextActive]}>Week</Text>
            </TouchableOpacity>
          </View>

          {/* Period Switcher */}
          <PeriodSwitcher
            currentPeriod={currentPeriod}
            onPeriodChange={handlePeriodChange}
          />
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft size={16} color={colors.text} />
            <Text style={styles.navButtonText}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setWeekStart(startOfWeek(new Date()))}
          >
            <Text style={styles.navButtonText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setWeekStart(addDays(weekStart, 7))}
          >
            <Text style={styles.navButtonText}>Next</Text>
            <ChevronRight size={16} color={colors.text} />
          </TouchableOpacity>

          {/* AI Actions */}
          <AIActions
            onPackThisWeek={handlePackThisWeek}
            onRebalance4Weeks={handleRebalance4Weeks}
            onWhatIf={handleWhatIf}
          />

          {/* Backlog Button */}
          <TouchableOpacity
            style={styles.backlogButton}
            onPress={() => setShowBacklog(true)}
            activeOpacity={0.7}
          >
            <List size={16} color={colors.text} />
            <Text style={styles.backlogButtonText}>Backlog</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Child Filter - Checkboxes like month view */}
      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Children</Text>
        <View style={styles.checkboxContainer}>
          {allChildren.map((child) => {
            const isSelected = selectedChildIds === null || selectedChildIds.includes(child.id);
            return (
              <TouchableOpacity
                key={child.id}
                style={styles.checkboxRow}
                onPress={() => {
                  if (selectedChildIds === null) {
                    // Break out of 'all' mode - select all OTHER children (exclude this one)
                    const otherChildren = allChildren
                      .filter(c => c.id !== child.id)
                      .map(c => c.id);
                    onChildFilterChange(otherChildren.length > 0 ? otherChildren : null);
                  } else if (isSelected) {
                    // Deselect this child
                    const newSelection = selectedChildIds.filter(id => id !== child.id);
                    // If nothing left, show all (set to null)
                    onChildFilterChange(newSelection.length === 0 ? null : newSelection);
                  } else {
                    // Select this child
                    onChildFilterChange([...selectedChildIds, child.id]);
                  }
                }}
              >
                <View style={[
                  styles.checkbox,
                  isSelected && styles.checkboxSelected
                ]}>
                  {isSelected && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <Text style={styles.checkboxLabel}>{child.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>


      {/* Week Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.grid}>
          {/* Header Row */}
          <View style={styles.gridHeader}>
            <View style={styles.timeColumn} />
            {days.map((d, i) => (
              <View key={i} style={styles.dayHeader}>
                <Text style={styles.dayHeaderDow}>{fmtDow(d)}</Text>
                <Text style={styles.dayHeaderDate}>{fmtDate(d)}</Text>
              </View>
            ))}
          </View>

          {/* Body */}
          <View style={styles.gridBody}>
            {/* Time Ruler */}
            <View style={styles.timeRuler}>
              {Array.from({ length: Math.floor((hours.endMin - hours.startMin) / hours.step) + 1 }).map((_, i) => {
                const labelMin = hours.startMin + i * hours.step;
                const hh = Math.floor(labelMin / 60);
                const mm = (labelMin % 60).toString().padStart(2, '0');
                return (
                  <Text key={i} style={styles.timeLabel}>
                    {hh}:{mm}
                  </Text>
                );
              })}
            </View>

            {/* Day Columns */}
            {days.map((d, i) => {
              const iso = d.toISOString().slice(0, 10);
              return (
                <DayColumn
                  key={i}
                  date={d}
                  hours={hours}
                  windows={availByDate[iso] || []}
                  events={eventsByDate[iso] || []}
                  onAdd={(startMin) => {
                    console.log('Add event', { date: iso, startMin });
                    onAddActivity?.({ date: iso, startMin });
                  }}
                  onEventChanged={handleEventChanged}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Backlog Drawer */}
      <BacklogDrawer
        open={showBacklog}
        onClose={() => setShowBacklog(false)}
        childId={selectedChildIds?.[0]}
        subjectId={null}
        onDragStart={handleBacklogDragStart}
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
            console.log('Applying proposals:', rescheduleReport.proposals);
            setRescheduleReport(null);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
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
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerText: {
    fontSize: 14,
    color: colors.muted,
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
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
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
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
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
    minWidth: 900,
  },
  gridHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeColumn: {
    width: 64,
  },
  dayHeader: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  dayHeaderDow: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dayHeaderDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  gridBody: {
    flexDirection: 'row',
    minHeight: 640,
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
  dayColumn: {
    flex: 1,
    minWidth: 120,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    position: 'relative',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
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
});
