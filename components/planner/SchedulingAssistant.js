/**
 * Scheduling Assistant Component
 * Outlook-style free/busy aggregation + interval solver + UI overlay
 * 
 * Features:
 * - Busy interval overlay on week grid
 * - Backlog list with suggested slots
 * - Drag-and-drop scheduling
 * - Confirmation flow
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Modal } from 'react-native';
import { Clock, Calendar, CheckCircle, X, Sparkles } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import WeekGrid from './WeekGrid';

const API_BASE = typeof window !== 'undefined' 
  ? (process.env.REACT_APP_API_URL || window.location.origin)
  : '';

export default function SchedulingAssistant({
  familyId,
  childId,
  weekStart,
  events = [],
  children = [],
  onEventPress,
  onEventRightClick,
  onEventComplete,
  onRefresh,
}) {
  const [backlogItems, setBacklogItems] = useState([]);
  const [busyIntervals, setBusyIntervals] = useState([]);
  const [suggestedSlots, setSuggestedSlots] = useState({}); // Map of event_id -> slots
  const [selectedBacklogItem, setSelectedBacklogItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState(null);
  const [activeHold, setActiveHold] = useState(null);

  // Calculate week end
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59);
    console.log('[SchedulingAssistant] Calculated weekEnd:', end.toISOString(), 'from weekStart:', weekStart.toISOString());
    return end;
  }, [weekStart]);

  // Validate childId format (should be a UUID)
  const isValidChildId = useMemo(() => {
    if (!childId) return false;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(childId);
  }, [childId]);

  const fetchBacklogItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .eq('child_id', childId)
        .eq('is_backlog', true)
        .neq('status', 'done')
        .neq('status', 'canceled')
        .is('deleted_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBacklogItems(data || []);
    } catch (error) {
      console.error('Error fetching backlog items:', error);
    } finally {
      setLoading(false);
    }
  }, [familyId, childId]);

  const fetchBusyIntervals = useCallback(async () => {
    if (!childId) {
      console.warn('[SchedulingAssistant] fetchBusyIntervals: childId is missing');
      return;
    }
    try {
      console.log('[SchedulingAssistant] Fetching busy intervals for childId:', childId, 'weekStart:', weekStart.toISOString());
      const response = await fetch(
        `${API_BASE}/api/schedule/availability?` +
        `child_id=${encodeURIComponent(childId)}&` +
        `time_min=${encodeURIComponent(weekStart.toISOString())}&` +
        `time_max=${encodeURIComponent(weekEnd.toISOString())}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error('[SchedulingAssistant] /availability failed:', response.status, detail);
        console.error('[SchedulingAssistant] Request URL:', `${API_BASE}/api/schedule/availability?child_id=${childId}&time_min=${weekStart.toISOString()}&time_max=${weekEnd.toISOString()}`);
        throw new Error(detail || 'Failed to fetch availability');
      }
      const data = await response.json();
      console.log('[SchedulingAssistant] Received busy intervals:', data.busy_intervals?.length || 0, 'intervals:', data.busy_intervals);
      console.log('[SchedulingAssistant] Full API response:', JSON.stringify(data, null, 2));
      
      // Log debug info if available
      if (data._debug) {
        console.log('[SchedulingAssistant] DEBUG INFO:', JSON.stringify(data._debug, null, 2));
        console.log('[SchedulingAssistant] Total events for family:', data._debug.total_events_for_family);
        console.log('[SchedulingAssistant] Overlapping events:', data._debug.overlapping_events_count);
        console.log('[SchedulingAssistant] RPC returned count:', data._debug.rpc_returned_count);
        if (data._debug.rpc_error) {
          console.error('[SchedulingAssistant] RPC ERROR:', data._debug.rpc_error);
        }
        if (data._debug.rpc_raw_data) {
          console.log('[SchedulingAssistant] RPC raw data (first 5):', data._debug.rpc_raw_data);
        }
      }
      
      setBusyIntervals(data.busy_intervals || []);
    } catch (error) {
      console.error('Error fetching busy intervals:', error);
    }
  }, [childId, weekStart, weekEnd]);

  // Fetch backlog items
  useEffect(() => {
    if (!familyId || !childId || !isValidChildId) {
      if (childId && !isValidChildId) {
        console.warn('[SchedulingAssistant] Invalid childId format:', childId);
      }
      return;
    }
    fetchBacklogItems();
  }, [familyId, childId, isValidChildId, fetchBacklogItems]);

  // Fetch busy intervals when week changes
  useEffect(() => {
    if (!familyId || !childId || !isValidChildId) {
      if (childId && !isValidChildId) {
        console.warn('[SchedulingAssistant] Invalid childId format, skipping fetchBusyIntervals:', childId);
      }
      return;
    }
    fetchBusyIntervals();
  }, [familyId, childId, isValidChildId, weekStart, weekEnd, fetchBusyIntervals]);

  const fetchSuggestedSlots = async (backlogItem) => {
    if (!childId) {
      console.warn('[SchedulingAssistant] fetchSuggestedSlots: childId is missing');
      return;
    }
    try {
      const duration = backlogItem.estimated_minutes || 60;
      console.log('[SchedulingAssistant] Fetching suggested slots for childId:', childId, 'eventId:', backlogItem.id, 'duration:', duration);
      const response = await fetch(
        `${API_BASE}/api/schedule/availability?` +
        `child_id=${encodeURIComponent(childId)}&` +
        `time_min=${encodeURIComponent(weekStart.toISOString())}&` +
        `time_max=${encodeURIComponent(weekEnd.toISOString())}&` +
        `duration_min=${duration}&` +
        `event_id=${encodeURIComponent(backlogItem.id)}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error('[SchedulingAssistant] /availability(suggestions) failed:', response.status, detail);
        console.error('[SchedulingAssistant] Request URL:', `${API_BASE}/api/schedule/availability?child_id=${childId}&time_min=${weekStart.toISOString()}&time_max=${weekEnd.toISOString()}&duration_min=${duration}&event_id=${backlogItem.id}`);
        throw new Error(detail || 'Failed to fetch suggestions');
      }
      const data = await response.json();
      setSuggestedSlots(prev => ({
        ...prev,
        [backlogItem.id]: data.suggested_slots || [],
      }));
    } catch (error) {
      console.error('Error fetching suggested slots:', error);
    }
  };

  const handleScheduleClick = async (backlogItem) => {
    setSelectedBacklogItem(backlogItem);
    await fetchSuggestedSlots(backlogItem);
  };

  const handleSlotSelect = async (slot) => {
    if (!selectedBacklogItem) return;

    try {
      // Create a hold
      const session = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE}/api/schedule/hold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          event_id: selectedBacklogItem.id,
          start_at: slot.start_at,
          end_at: slot.end_at,
        }),
      });

      if (!response.ok) throw new Error('Failed to create hold');
      const holdData = await response.json();
      setActiveHold(holdData);
      setPendingSchedule({
        backlogItem: selectedBacklogItem,
        slot,
        holdId: holdData.hold_id,
      });
      setShowConfirmModal(true);
    } catch (error) {
      console.error('Error creating hold:', error);
      alert('Failed to reserve time slot. Please try again.');
    }
  };

  const handleConfirm = async () => {
    if (!pendingSchedule) return;

    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE}/api/schedule/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          hold_id: pendingSchedule.holdId,
          event_id: pendingSchedule.backlogItem.id,
          start_at: pendingSchedule.slot.start_at,
          end_at: pendingSchedule.slot.end_at,
          title: pendingSchedule.backlogItem.title,
          subject_id: pendingSchedule.backlogItem.subject_id,
        }),
      });

      if (!response.ok) throw new Error('Failed to confirm schedule');
      
      // Refresh data
      await fetchBacklogItems();
      await fetchBusyIntervals();
      if (onRefresh) onRefresh();

      // Close modal and reset state
      setShowConfirmModal(false);
      setPendingSchedule(null);
      setActiveHold(null);
      setSelectedBacklogItem(null);
    } catch (error) {
      console.error('Error confirming schedule:', error);
      alert('Failed to schedule. Please try again.');
    }
  };

  const handleCancel = async () => {
    // Delete hold if exists
    if (activeHold?.hold_id) {
      try {
        const session = await supabase.auth.getSession();
        await fetch(`${API_BASE}/api/schedule/hold/${activeHold.hold_id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
        }).catch(err => console.error('Error deleting hold:', err));
      } catch (error) {
        console.error('Error deleting hold:', error);
      }
    }

    setShowConfirmModal(false);
    setPendingSchedule(null);
    setActiveHold(null);
    setSelectedBacklogItem(null);
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      {/* Left Sidebar - Backlog List */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>Backlog</Text>
          <Text style={styles.sidebarSubtitle}>Items to schedule</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : (
          <ScrollView style={styles.backlogList}>
            {backlogItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.backlogItem,
                  selectedBacklogItem?.id === item.id && styles.backlogItemSelected,
                ]}
                onPress={() => handleScheduleClick(item)}
              >
                <View style={styles.backlogItemHeader}>
                  <Text style={styles.backlogItemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.priority && item.priority > 0 && (
                    <View style={[styles.priorityBadge, styles[`priority${Math.min(item.priority, 5)}`]]}>
                      <Text style={styles.priorityText}>{item.priority}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.backlogItemMeta}>
                  {item.estimated_minutes && (
                    <View style={styles.metaItem}>
                      <Clock size={12} color={colors.muted} />
                      <Text style={styles.metaText}>{item.estimated_minutes} min</Text>
                    </View>
                  )}
                  {item.due_ts && (
                    <View style={styles.metaItem}>
                      <Calendar size={12} color={colors.muted} />
                      <Text style={styles.metaText}>
                        {new Date(item.due_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Suggested Slots Preview */}
                {suggestedSlots[item.id] && suggestedSlots[item.id].length > 0 && (
                  <View style={styles.suggestedSlotsPreview}>
                    <Text style={styles.suggestedSlotsLabel}>Suggested:</Text>
                    {suggestedSlots[item.id].slice(0, 3).map((slot, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.suggestedSlotChip}
                        onPress={() => handleSlotSelect(slot)}
                      >
                        <Text style={styles.suggestedSlotText}>
                          {formatDate(slot.start_at)} {formatTime(slot.start_at)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {backlogItems.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No items in backlog</Text>
                <Text style={styles.emptySubtext}>Add tasks to schedule them here</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Right Side - Week Grid with Busy Overlay */}
      <View style={styles.gridContainer}>
        <WeekGrid
          anchorDate={weekStart}
          events={events}
          onSelectDate={() => {}}
          onEventPress={onEventPress}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
          children={children}
          busyIntervals={busyIntervals}
          suggestedSlots={selectedBacklogItem ? suggestedSlots[selectedBacklogItem.id] : []}
          onSlotSelect={handleSlotSelect}
        />
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Schedule</Text>
              <TouchableOpacity onPress={handleCancel}>
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {pendingSchedule && (
              <>
                <View style={styles.confirmDetails}>
                  <Text style={styles.confirmLabel}>Task:</Text>
                  <Text style={styles.confirmValue}>{pendingSchedule.backlogItem.title}</Text>

                  <Text style={styles.confirmLabel}>Time:</Text>
                  <Text style={styles.confirmValue}>
                    {formatDate(pendingSchedule.slot.start_at)} {formatTime(pendingSchedule.slot.start_at)} - {formatTime(pendingSchedule.slot.end_at)}
                  </Text>

                  {pendingSchedule.slot.reasons && pendingSchedule.slot.reasons.length > 0 && (
                    <>
                      <Text style={styles.confirmLabel}>Why this time:</Text>
                      <View style={styles.reasonsList}>
                        {pendingSchedule.slot.reasons.map((reason, idx) => (
                          <View key={idx} style={styles.reasonItem}>
                            <CheckCircle size={14} color={colors.greenBold} />
                            <Text style={styles.reasonText}>{reason}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={handleCancel}
                  >
                    <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonConfirm]}
                    onPress={handleConfirm}
                  >
                    <Text style={styles.modalButtonTextConfirm}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  sidebar: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      boxShadow: '2px 0 4px rgba(0,0,0,0.05)',
    }),
  },
  sidebarHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sidebarSubtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  backlogList: {
    flex: 1,
  },
  backlogItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backlogItemSelected: {
    backgroundColor: colors.blueSoft,
  },
  backlogItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  backlogItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priority1: { backgroundColor: '#fee2e2' },
  priority2: { backgroundColor: '#fef3c7' },
  priority3: { backgroundColor: '#dbeafe' },
  priority4: { backgroundColor: '#e0e7ff' },
  priority5: { backgroundColor: '#f3e8ff' },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  backlogItemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  suggestedSlotsPreview: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestedSlotsLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  suggestedSlotChip: {
    backgroundColor: colors.blueSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  suggestedSlotText: {
    fontSize: 11,
    color: colors.blueBold,
    fontWeight: '500',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.muted,
  },
  gridContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  confirmDetails: {
    marginBottom: 24,
  },
  confirmLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 4,
  },
  confirmValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  reasonsList: {
    marginTop: 8,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.bgSubtle,
  },
  modalButtonConfirm: {
    backgroundColor: colors.accent,
  },
  modalButtonTextCancel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  modalButtonTextConfirm: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
