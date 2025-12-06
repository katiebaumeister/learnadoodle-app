import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { X, Calendar } from 'lucide-react';
import { useToast } from '../Toast';
import CollapsibleCard from '../ui/CollapsibleCard';
import WeeklyHoursMiniGrid from '../ui/WeeklyHoursMiniGrid';
import AvailabilityScopeSwitcher from '../availability/AvailabilityScopeSwitcher';
import GoogleCalendarConnect from '../GoogleCalendarConnect';
import AdjustScheduleModal from './AdjustScheduleModal';
import { supabase } from '../../lib/supabase';
import { getGoogleCalendarStatus } from '../../lib/apiClient';
import { logBlackoutCreated, logOverrideCreated } from '../../app/services/plannerInstrumentation';

/**
 * ScheduleSettingsModal
 * Unified modal for managing learning hours, adjustments, and calendar sync
 */
export default function ScheduleSettingsModal({
  visible,
  onClose,
  familyId,
  children = [],
  onOpenFullEditor = null,
}) {
  const [openCard, setOpenCard] = useState(null); // 'hours', 'adjustments', 'calendars'
  const [selectedScope, setSelectedScope] = useState('family');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [showAdjustScheduleModal, setShowAdjustScheduleModal] = useState(false);
  
  // Learning Hours state
  const [weeklyBlocks, setWeeklyBlocks] = useState([]);
  const [rules, setRules] = useState([]);
  
  // Adjustments state
  const [overrides, setOverrides] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  
  // Calendar state
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState({ connected: false });
  
  const toast = useToast();

  // Load data when modal opens
  useEffect(() => {
    if (visible && familyId) {
      loadAllData();
    }
  }, [visible, familyId, selectedScope, selectedChildId]);

  const loadAllData = async () => {
    await Promise.all([
      loadRules(),
      loadOverrides(),
      loadBlackouts(),
      loadGoogleCalendarStatus(),
    ]);
  };

  const loadRules = async () => {
    if (!familyId) return;
    
    try {
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      const { data, error } = await supabase
        .from('schedule_rules')
        .select('*')
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('is_active', true);

      if (error) throw error;

      setRules(data || []);
      
      // Transform rules to blocks for mini grid
      const blocks = [];
      data?.forEach(rule => {
        if ((rule.rule_type === 'availability_teach' || rule.rule_kind === 'teach') && rule.rrule?.byweekday) {
          const dayMapping = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
          rule.rrule.byweekday.forEach(dayId => {
            blocks.push({
              id: `${rule.id}-${dayId}`,
              kind: 'learn',
              day: dayMapping[dayId] || 'MO',
              start: rule.start_time || '09:00',
              end: rule.end_time || '15:00',
              source: selectedScope,
            });
          });
        }
      });
      
      setWeeklyBlocks(blocks);
    } catch (error) {
      console.error('Error loading rules:', error);
    }
  };

  const loadOverrides = async () => {
    if (!familyId) return;
    
    try {
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      const { data, error } = await supabase
        .from('schedule_overrides')
        .select('*')
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      setOverrides(data || []);
    } catch (error) {
      console.error('Error loading overrides:', error);
    }
  };

  const loadBlackouts = async () => {
    if (!familyId) return;
    
    try {
      let query = supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .gte('ends_on', new Date().toISOString().split('T')[0])
        .order('starts_on', { ascending: true });

      if (selectedScope === 'child' && selectedChildId) {
        query = query.or(`child_id.eq.${selectedChildId},child_id.is.null`);
      } else {
        query = query.is('child_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBlackouts(data || []);
    } catch (error) {
      console.error('Error loading blackouts:', error);
    }
  };

  const loadGoogleCalendarStatus = async () => {
    try {
      const { data } = await getGoogleCalendarStatus();
      setGoogleCalendarStatus(data || { connected: false });
    } catch (error) {
      console.error('Error loading Google Calendar status:', error);
    }
  };

  const handleToggleCard = (cardId) => {
    setOpenCard(openCard === cardId ? null : cardId);
  };

  const handleScopeChange = (scope, childId) => {
    setSelectedScope(scope);
    setSelectedChildId(childId);
  };

  const handleBlocksChange = (blocks) => {
    setWeeklyBlocks(blocks);
    // Auto-save could go here, or require explicit Save button
  };

  const handleSaveOverride = async (overrideData) => {
    try {
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      console.warn('[ScheduleSettingsModal] handleSaveOverride called:', overrideData);
      
      // Use upsert with conflict resolution on the unique constraint
      // The unique constraint is: scope_type, scope_id, date, override_kind
      console.warn('[ScheduleSettingsModal] Upserting override...');
      const { error: overrideError } = await supabase
        .from('schedule_overrides')
        .upsert({
          scope_type: selectedScope,
          scope_id: scopeId,
          date: overrideData.date,
          override_kind: overrideData.override_kind,
          start_time: overrideData.start_time || null,
          end_time: overrideData.end_time || null,
          notes: overrideData.notes || null,
          is_active: true,
        }, {
          onConflict: 'scope_type,scope_id,date,override_kind',
        });

      if (overrideError) {
        console.error('[ScheduleSettingsModal] Error saving override:', overrideError);
        console.error('[ScheduleSettingsModal] Error details:', JSON.stringify(overrideError, null, 2));
        throw overrideError;
      }
      
      console.warn('[ScheduleSettingsModal] Override saved successfully');
      
      // Log override creation action
      logOverrideCreated(
        overrideData.date,
        overrideData.override_kind,
        selectedScope === 'child' ? selectedChildId : undefined
      );

      // If this is a "day_off" override, also create a blackout_period so it shows on the calendar
      if (overrideData.override_kind === 'day_off') {
        console.warn('[ScheduleSettingsModal] Creating blackout_period for day_off override');
        const childId = selectedScope === 'child' ? selectedChildId : null;
        
        // Clear events if requested
        let clearedCount = 0;
        if (overrideData.clearEvents) {
          clearedCount = await deleteEventsInRange({
            startDate: overrideData.date,
            endDate: overrideData.date,
            childId,
          });
          if (clearedCount > 0) {
            toast.push(`Removed ${clearedCount} scheduled event${clearedCount === 1 ? '' : 's'}`, 'info');
          }
        }
        
        const { data: blackoutData, error: blackoutError } = await createBlackout({
          familyId,
          childId,
          startsOn: overrideData.date,
          endsOn: overrideData.date, // Single day blackout
          reason: overrideData.notes || 'No school',
        });

        if (blackoutError) {
          console.error('[ScheduleSettingsModal] Error creating blackout for day_off:', blackoutError);
          // Don't throw - the override was saved, just the blackout failed
          toast.push('Adjustment saved, but calendar may not update', 'warning');
        } else {
          console.warn('[ScheduleSettingsModal] Blackout created successfully:', blackoutData);
        }
      }

      toast.push('Adjustment saved', 'success');
      setSelectedDate(null);
      loadOverrides();
      loadBlackouts();
      
      // Refresh calendar to show the blackout
      if (typeof window !== 'undefined' && overrideData.override_kind === 'day_off') {
        // Wait a bit for database to commit
        setTimeout(() => {
          const blackoutDate = new Date(overrideData.date);
          const blackoutMonth = blackoutDate.getMonth();
          const blackoutYear = blackoutDate.getFullYear();
          
          console.warn('[ScheduleSettingsModal] Dispatching refresh events for month:', {
            year: blackoutYear,
            month: blackoutMonth,
            date: overrideData.date,
          });
          
          const refreshEvent = new CustomEvent('refreshCalendar', { 
            detail: { 
              skipHomeRefresh: true,
              targetMonth: blackoutMonth,
              targetYear: blackoutYear,
            } 
          });
          window.dispatchEvent(refreshEvent);
          console.warn('[ScheduleSettingsModal] refreshCalendar event dispatched');
          
          const plannerRefreshEvent = new CustomEvent('refreshPlannerWeek');
          window.dispatchEvent(plannerRefreshEvent);
          console.warn('[ScheduleSettingsModal] refreshPlannerWeek event dispatched');
          
          // Also try calling the refresh function directly if available
          if (window.__refreshCalendarData) {
            console.warn('[ScheduleSettingsModal] Calling window.__refreshCalendarData directly');
            window.__refreshCalendarData(blackoutDate);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('[ScheduleSettingsModal] Error saving override:', error);
      toast.push('Failed to save adjustment', 'error');
    }
  };

  const deleteEventsInRange = useCallback(async ({ startDate, endDate, childId }) => {
    if (!familyId) return 0;

    const startBoundary = new Date(`${startDate}T00:00:00.000Z`).toISOString();
    const endBoundaryDate = new Date(`${endDate}T00:00:00.000Z`);
    endBoundaryDate.setDate(endBoundaryDate.getDate() + 1);
    const endBoundary = endBoundaryDate.toISOString();

    let query = supabase
      .from('events')
      .select('id')
      .eq('family_id', familyId)
      .gte('start_ts', startBoundary)
      .lt('start_ts', endBoundary)
      .not('status', 'eq', 'done');

    if (childId) {
      query = query.eq('child_id', childId);
    }

    const { data: eventsToRemove, error } = await query;
    if (error) {
      console.error('Error loading events to clear:', error);
      throw error;
    }

    const eventIds = eventsToRemove?.map((event) => event.id) || [];
    if (eventIds.length === 0) {
      return 0;
    }

    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .in('id', eventIds);

    if (deleteError) {
      console.error('Error deleting events:', deleteError);
      throw deleteError;
    }

    return eventIds.length;
  }, [familyId]);

  const updateCalendarCacheForBlackout = useCallback(async ({ startDate, endDate, childId, reason }) => {
    if (!familyId) return;
    try {
      const impactedChildIds = childId ? [childId] : (children || []).map((child) => child.id).filter(Boolean);
      const rows = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const nowIso = new Date().toISOString();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        rows.push({
          family_id: familyId,
          child_id: null,
          date: dateStr,
          day_status: 'off',
          first_block_start: null,
          last_block_end: null,
          generated_at: nowIso,
          source_summary: {
            source: 'schedule_settings_modal',
            reason: reason || 'time off',
          },
        });
        impactedChildIds.forEach((cid) => {
          rows.push({
            family_id: familyId,
            child_id: cid,
            date: dateStr,
            day_status: 'off',
            first_block_start: null,
            last_block_end: null,
            generated_at: nowIso,
            source_summary: {
              source: 'schedule_settings_modal',
              reason: reason || 'time off',
            },
          });
        });
      }
      if (rows.length > 0) {
        await supabase
          .from('calendar_days_cache')
          .upsert(rows, { onConflict: 'family_id,child_id,date' });
      }
    } catch (error) {
      console.warn('Failed to update calendar cache for blackout', error);
    }
  }, [familyId, children]);

  const handleAddTimeOff = async (timeOffData) => {
    // Use alert for maximum visibility
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('handleAddTimeOff CALLED - Check console for details');
    }
    // Use console.warn/error which are less likely to be filtered
    console.warn('=== [ScheduleSettingsModal] handleAddTimeOff CALLED ===');
    console.warn('[ScheduleSettingsModal] timeOffData:', JSON.stringify(timeOffData, null, 2));
    console.error('[ScheduleSettingsModal] handleAddTimeOff called - ERROR LEVEL LOG FOR VISIBILITY');
    console.error('[ScheduleSettingsModal] familyId:', familyId);
    console.error('[ScheduleSettingsModal] selectedScope:', selectedScope);
    console.error('[ScheduleSettingsModal] selectedChildId:', selectedChildId);
    
    try {
      const childId = selectedScope === 'child' ? selectedChildId : null;
      
      console.warn('[ScheduleSettingsModal] Creating blackout with params:', {
        familyId,
        childId,
        startsOn: timeOffData.start,
        endsOn: timeOffData.end,
        reason: timeOffData.reason || 'Time off',
        selectedScope,
        selectedChildId,
      });
      
      console.warn('[ScheduleSettingsModal] About to call createBlackout...');
      const { data: blackoutData, error } = await createBlackout({
        familyId,
        childId,
        startsOn: timeOffData.start,
        endsOn: timeOffData.end,
        reason: timeOffData.reason || 'Time off',
      });

      console.warn('[ScheduleSettingsModal] createBlackout returned - hasData:', !!blackoutData, 'hasError:', !!error);
      if (blackoutData) {
        console.warn('[ScheduleSettingsModal] blackoutData:', JSON.stringify(blackoutData, null, 2));
      }
      if (error) {
        console.error('[ScheduleSettingsModal] error:', JSON.stringify(error, null, 2));
      }

      if (error) {
        console.error('[ScheduleSettingsModal] ERROR creating blackout:', error);
        console.error('[ScheduleSettingsModal] Error details:', JSON.stringify(error, null, 2));
        toast.push(`Failed to create time off: ${error.message || 'Unknown error'}`, 'error');
        throw error;
      }
      
      console.warn('[ScheduleSettingsModal] Blackout creation result:', blackoutData);
      
      if (!blackoutData || !blackoutData.blackoutId) {
        console.error('🚨🚨🚨 [ScheduleSettingsModal] ❌ Blackout creation returned no data!');
        toast.push('Failed to create time off: No blackout ID returned', 'error');
        throw new Error('Blackout creation returned no data');
      }
      
      // Immediately try to read the blackout back by ID to verify it exists and is readable
      console.log('🚨🚨🚨 [ScheduleSettingsModal] Immediately verifying blackout by ID:', blackoutData.blackoutId);
      const { data: immediateVerify, error: immediateError } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('id', blackoutData.blackoutId)
        .single();
      
      console.log('🚨🚨🚨 [ScheduleSettingsModal] Immediate verification result:', {
        found: !!immediateVerify,
        blackout: immediateVerify,
        error: immediateError,
      });
      
      if (!immediateVerify && !immediateError) {
        console.error('🚨🚨🚨 [ScheduleSettingsModal] ❌ CRITICAL: Blackout was created but cannot be read back! This is an RLS issue.');
        toast.push('Time off created but cannot be read. This may be a permissions issue. Please refresh the page.', 'warning');
      } else if (immediateError) {
        console.error('🚨🚨🚨 [ScheduleSettingsModal] ❌ Error reading blackout back:', immediateError);
        toast.push('Time off created but verification failed. Please refresh the page.', 'warning');
      }
      
      // Check if blackout can be read back (RLS check)
      if (blackoutData.canReadBack === false) {
        console.error('🚨🚨🚨 [ScheduleSettingsModal] ⚠️ WARNING: Blackout created but cannot be read back - RLS issue!');
        toast.push('Time off created but may not be visible. Please refresh the page.', 'warning');
      }

      let clearedCount = 0;
      if (timeOffData.clearEvents) {
        clearedCount = await deleteEventsInRange({
          startDate: timeOffData.start,
          endDate: timeOffData.end,
          childId,
        });
      }

      await updateCalendarCacheForBlackout({
        startDate: timeOffData.start,
        endDate: timeOffData.end,
        childId,
        reason: timeOffData.reason,
      });

      // Ensure cache is refreshed after blackout creation
      try {
        await supabase.rpc('refresh_calendar_days_cache', {
          p_family_id: familyId,
          p_from_date: timeOffData.start,
          p_to_date: timeOffData.end,
        });
      } catch (refreshError) {
        console.warn('Cache refresh error (non-critical):', refreshError);
      }

      // Verify blackout was created - try multiple queries to debug
      console.log('[ScheduleSettingsModal] Verifying blackout was created...');
      console.log('[ScheduleSettingsModal] Verification params:', {
        familyId,
        startsOn: timeOffData.start,
        endsOn: timeOffData.end,
      });
      
      // First, check if ANY blackouts exist for this family
      const { data: allFamilyBlackouts, error: allError } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId);
      
      console.log('[ScheduleSettingsModal] All blackouts for family:', {
        count: allFamilyBlackouts?.length || 0,
        blackouts: allFamilyBlackouts,
        error: allError,
      });
      
      // Then check for the specific blackout
      const { data: verifyBlackout, error: verifyError } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .eq('starts_on', timeOffData.start)
        .eq('ends_on', timeOffData.end);
      
      console.log('[ScheduleSettingsModal] Specific blackout verification:', {
        found: verifyBlackout?.length || 0,
        blackouts: verifyBlackout,
        error: verifyError,
      });
      
      // Also try a broader query to see if it's there with different date format
      const { data: broadBlackouts } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .gte('starts_on', timeOffData.start)
        .lte('ends_on', timeOffData.end);
      
      console.log('[ScheduleSettingsModal] Broad query (date range):', {
        count: broadBlackouts?.length || 0,
        blackouts: broadBlackouts,
      });

      // Log blackout creation action
      logBlackoutCreated(
        timeOffData.start,
        timeOffData.end,
        timeOffData.reason || 'Time off',
        childId
      );

      toast.push('Time off added', 'success');
      loadBlackouts();

      if (clearedCount > 0) {
        toast.push(`Removed ${clearedCount} scheduled event${clearedCount === 1 ? '' : 's'}`, 'info');
      }

      // Wait a bit longer and verify again before refreshing
      console.log('[ScheduleSettingsModal] ⏳ Waiting 2 seconds for database commit, then verifying...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Final verification after delay - query by the blackout ID we got back
      if (blackoutData && blackoutData.blackoutId) {
        const { data: verifyById, error: verifyByIdError } = await supabase
          .from('blackout_periods')
          .select('*')
          .eq('id', blackoutData.blackoutId)
          .single();
        
        console.log('[ScheduleSettingsModal] 🔍 Verification by ID:', {
          blackoutId: blackoutData.blackoutId,
          found: !!verifyById,
          blackout: verifyById,
          error: verifyByIdError,
        });
      }
      
      // Also query all blackouts for family
      const { data: finalVerify, error: finalVerifyError } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId);
      
      console.log('[ScheduleSettingsModal] 🔍 Final verification (all family blackouts):', {
        count: finalVerify?.length || 0,
        blackouts: finalVerify?.map(b => ({ 
          id: b.id, 
          starts_on: b.starts_on, 
          ends_on: b.ends_on,
          child_id: b.child_id,
          family_id: b.family_id,
        })),
        error: finalVerifyError,
      });
      
      if (!finalVerify || finalVerify.length === 0) {
        console.error('[ScheduleSettingsModal] ❌ WARNING: No blackouts found after creation! This might be an RLS issue.');
        toast.push('Time off may not be visible due to permissions. Please refresh the page.', 'warning');
      }

      // Force calendar refresh immediately - cache should be updated by now
      // Add small delay to ensure database writes are complete
      console.log('[ScheduleSettingsModal] Preparing to dispatch refresh events for date:', timeOffData.start);
      
      // Calculate which month this blackout falls in so we refresh the right month
      const blackoutDate = new Date(timeOffData.start);
      const blackoutMonth = blackoutDate.getMonth(); // 0-indexed
      const blackoutYear = blackoutDate.getFullYear();
      console.log('[ScheduleSettingsModal] Blackout is in month:', { year: blackoutYear, month: blackoutMonth, monthKey: `${blackoutYear}-${blackoutMonth}` });
      
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          console.log('[ScheduleSettingsModal] Dispatching refreshCalendar and refreshPlannerWeek events');
          const refreshEvent = new CustomEvent('refreshCalendar', { 
            detail: { 
              skipHomeRefresh: true,
              targetMonth: blackoutMonth,
              targetYear: blackoutYear,
            } 
          });
          window.dispatchEvent(refreshEvent);
          console.log('[ScheduleSettingsModal] refreshCalendar event dispatched with detail:', refreshEvent.detail);
          
          // Also dispatch refreshPlannerWeek directly to ensure week view updates
          const plannerRefreshEvent = new CustomEvent('refreshPlannerWeek');
          window.dispatchEvent(plannerRefreshEvent);
          console.log('[ScheduleSettingsModal] refreshPlannerWeek event dispatched');
          
          // Also try directly calling refreshCalendarData if available, with the blackout date
          if (window.__refreshCalendarData) {
            console.log('[ScheduleSettingsModal] Calling window.__refreshCalendarData directly with date:', blackoutDate);
            window.__refreshCalendarData(blackoutDate);
          }
        }, 1000); // Increased delay to ensure DB writes complete
      }
    } catch (error) {
      console.error('🚨🚨🚨 [ScheduleSettingsModal] ❌ ERROR in handleAddTimeOff:', error);
      console.error('🚨🚨🚨 [ScheduleSettingsModal] Error stack:', error.stack);
      console.error('🚨🚨🚨 [ScheduleSettingsModal] Error details:', JSON.stringify(error, null, 2));
      toast.push(`Failed to add time off: ${error.message || 'Unknown error'}`, 'error');
      
      // Even on error, try to verify if blackout was created
      try {
        const { data: errorVerify } = await supabase
          .from('blackout_periods')
          .select('*')
          .eq('family_id', familyId)
          .gte('starts_on', timeOffData.start)
          .lte('ends_on', timeOffData.end);
        console.log('🚨🚨🚨 [ScheduleSettingsModal] Error recovery - checking if blackout exists:', {
          found: errorVerify?.length || 0,
          blackouts: errorVerify,
        });
      } catch (verifyErr) {
        console.error('🚨🚨🚨 [ScheduleSettingsModal] Error during error recovery verification:', verifyErr);
      }
    }
  };

  const handleDeleteTimeOff = async (timeOff) => {
    try {
      await supabase
        .from('blackout_periods')
        .delete()
        .eq('id', timeOff.id);

      toast.push('Time off removed', 'success');
      loadBlackouts();
    } catch (error) {
      console.error('Error deleting time off:', error);
      toast.push('Failed to remove time off', 'error');
    }
  };

  const handleOpenFullEditor = () => {
    if (onOpenFullEditor) {
      onOpenFullEditor({
        scope: selectedScope,
        childId: selectedChildId,
      });
    }
  };

  if (!visible) return null;

  return (
    <>
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} onTouchEnd={onClose}>
        <View style={styles.modal} onTouchEnd={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Schedule Settings</Text>
              <Text style={styles.headerSubtitle}>
                Learning hours, adjustments, and calendar sync.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Choose Person Section */}
          <View style={styles.choosePersonCard}>
            <Text style={styles.choosePersonLabel}>Choose person</Text>
            <AvailabilityScopeSwitcher
              selectedScope={selectedScope}
              selectedChildId={selectedChildId}
              children={children}
              onScopeChange={handleScopeChange}
            />
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
          >
            {/* Card 1: Weekly Learning Hours */}
            <CollapsibleCard
              title="Weekly Learning Hours"
              description="Edit your family's default weekly schedule."
              isOpen={openCard === 'hours'}
              onToggle={() => handleToggleCard('hours')}
            >
              <WeeklyHoursMiniGrid
                blocks={weeklyBlocks}
                onBlocksChange={handleBlocksChange}
                onOpenFullEditor={handleOpenFullEditor}
              />
            </CollapsibleCard>

            {/* Card 2: Adjustments - Unified */}
            <CollapsibleCard
              title="Adjustments"
              description="Use when a day differs from your regular schedule."
              isOpen={openCard === 'adjustments'}
              onToggle={() => handleToggleCard('adjustments')}
            >
              <View style={styles.adjustmentUnifiedContainer}>
                <Text style={styles.adjustmentUnifiedDescription}>
                  Adjust schedules for single days or date ranges. Choose what happens to existing learning sessions.
                </Text>
                <TouchableOpacity
                  style={styles.adjustScheduleButton}
                  onPress={() => setShowAdjustScheduleModal(true)}
                  activeOpacity={0.7}
                >
                  <Calendar size={18} color="#7c8cff" />
                  <Text style={styles.adjustScheduleButtonText}>Adjust Schedule</Text>
                </TouchableOpacity>
              </View>
            </CollapsibleCard>

            {/* Card 3: Connected Calendars */}
            <CollapsibleCard
              title="Connected Calendars"
              description="Sync your Learnadoodle schedule with external calendars."
              isOpen={openCard === 'calendars'}
              onToggle={() => handleToggleCard('calendars')}
            >
              <View style={styles.calendarsContainer}>
                {/* Google Calendar */}
                <View style={styles.calendarTileCard}>
                  <View style={styles.calendarTileHeader}>
                    <View style={[styles.calendarIcon, { backgroundColor: '#4285f415' }]}>
                      <Calendar size={24} color="#4285f4" />
                    </View>
                    <View style={styles.calendarTileInfo}>
                      <Text style={styles.calendarTileTitle}>Google Calendar</Text>
                      <Text style={styles.calendarTileSubtitle}>Two-way sync</Text>
                    </View>
                  </View>
                  <GoogleCalendarConnect
                    familyId={familyId}
                    onConnected={() => {
                      loadGoogleCalendarStatus();
                      toast.push('Google Calendar ready', 'success');
                    }}
                  />
                </View>

                {/* Divider */}
                <View style={styles.calendarDivider} />

                {/* Apple Calendar */}
                <View style={styles.calendarTileCard}>
                  <View style={styles.calendarTileHeader}>
                    <View style={[styles.calendarIcon, { backgroundColor: '#007AFF15' }]}>
                      <Calendar size={24} color="#007AFF" />
                    </View>
                    <View style={styles.calendarTileInfo}>
                      <Text style={styles.calendarTileTitle}>Apple Calendar</Text>
                      <Text style={styles.calendarTileSubtitle}>Subscribe via ICS</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => {
                      toast.push('ICS link copied to clipboard', 'success');
                    }}
                  >
                    <Text style={styles.copyButtonText}>Copy ICS Link</Text>
                  </TouchableOpacity>
                  <Text style={styles.icsNote}>
                    ICS subscriptions are read-only. Copy the link below into Apple Calendar.
                  </Text>
                </View>
              </View>
            </CollapsibleCard>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerHint}>
              Any changes here affect planning, rebalancing, and AI proposals.
            </Text>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                toast.push('Settings saved', 'success');
                onClose();
              }}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Unified Adjust Schedule Modal */}
    <AdjustScheduleModal
      visible={showAdjustScheduleModal}
      onClose={() => setShowAdjustScheduleModal(false)}
      familyId={familyId}
      children={children}
      selectedScope={selectedScope}
      selectedChildId={selectedChildId}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(2px)',
    }),
  },
  modal: {
    width: Platform.OS === 'web' ? 680 : '90%',
    maxWidth: 680,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 40px rgba(0, 0, 0, 0.12)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 231, 235, 0.9)',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(10px)',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
    }),
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
    marginLeft: 16,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
      },
    }),
  },
  choosePersonCard: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  choosePersonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  content: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  contentContainer: {
    padding: 24,
    gap: 16,
    paddingBottom: 32,
  },
  adjustmentSection: {
    marginBottom: 24,
  },
  adjustmentSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  timeOffListContainer: {
    marginTop: 16,
  },
  adjustmentUnifiedContainer: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  adjustmentUnifiedDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  adjustScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#6c7bf3',
      },
    }),
  },
  adjustScheduleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  calendarsContainer: {
    gap: 16,
  },
  calendarTileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    gap: 16,
  },
  calendarTileHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  calendarIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calendarTileInfo: {
    flex: 1,
  },
  calendarTileTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  calendarTileSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  calendarDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 0,
  },
  copyButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
    alignItems: 'center',
  },
  copyButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  icsNote: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229, 231, 235, 0.8)',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      bottom: 0,
      zIndex: 98,
    }),
  },
  footerHint: {
    flex: 1,
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 16,
    opacity: 0.7,
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#6c7bf3',
        boxShadow: '0 2px 8px rgba(124, 140, 255, 0.3)',
      },
    }),
  },
  saveButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
});
