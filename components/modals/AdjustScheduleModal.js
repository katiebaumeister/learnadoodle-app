import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Platform, TextInput } from 'react-native';
import { X, Calendar } from 'lucide-react';
import { useToast } from '../Toast';
import SelectableChip from '../ui/SelectableChip';
import AvailabilityScopeSwitcher from '../availability/AvailabilityScopeSwitcher';
import { adjustSchedule } from '../../lib/apiClient';
import { logScheduleAdjusted } from '../../app/services/plannerInstrumentation';

/**
 * AdjustScheduleModal
 * Unified modal for adjusting schedules (replaces Time Off + One-Time Changes)
 * 
 * Core Philosophy:
 * - Tasks represent intent, Events represent execution
 * - Tasks must never disappear, Events are ephemeral
 * - Clear scheduled events = Unschedule intelligently (backlog/reschedule/cancel)
 */
export default function AdjustScheduleModal({
  visible,
  onClose,
  familyId,
  children = [],
  selectedScope: initialScope = 'family',
  selectedChildId: initialChildId = null,
}) {
  const [selectedScope, setSelectedScope] = useState(initialScope);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [adjustmentType, setAdjustmentType] = useState(null);
  const [eventHandling, setEventHandling] = useState('reschedule'); // 'reschedule' | 'backlog' | 'cancel'
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const toast = useToast();

  // Determine if single day or range
  const isRange = startDate && endDate && startDate !== endDate;
  const isSingleDay = startDate && (!endDate || startDate === endDate);

  // Single-day adjustment chips
  const singleDayChips = [
    { value: 'no_school', label: 'No School' },
    { value: 'shorter_day', label: 'Shorter Day' },
    { value: 'custom_hours', label: 'Custom Hours' },
    { value: 'partial_day', label: 'Partial Day' },
    { value: 'late_start', label: 'Late Start' },
    { value: 'early_end', label: 'Early End' },
  ];

  // Multi-day adjustment chips
  const multiDayChips = [
    { value: 'vacation', label: 'Vacation' },
    { value: 'holiday_week', label: 'Holiday Week' },
    { value: 'travel_week', label: 'Travel Week' },
    { value: 'testing_week', label: 'Testing Week' },
    { value: 'extended_break', label: 'Extended Break' },
  ];

  const handleScopeChange = (scope, childId) => {
    setSelectedScope(scope);
    setSelectedChildId(childId);
  };

  const handleSave = async () => {
    if (!startDate || !adjustmentType) {
      toast.push('Please select a date and adjustment type', 'error');
      return;
    }

    setSaving(true);
    try {
      const personId = selectedScope === 'family' ? familyId : selectedChildId;
      
      // Ensure dates are in YYYY-MM-DD format (no timezone conversion)
      // HTML5 date inputs already return YYYY-MM-DD, but double-check
      const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
      const normalizedEndDate = (endDate || startDate).includes('T') ? (endDate || startDate).split('T')[0] : (endDate || startDate);
      
      console.log('[AdjustScheduleModal] Submitting schedule adjustment:', {
        person_id: personId,
        family_id: familyId,
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
        adjustment_type: adjustmentType,
        event_handling: eventHandling,
        scope: selectedScope,
        originalStartDate: startDate,
        originalEndDate: endDate,
      });
      
      const response = await adjustSchedule({
        person_id: personId,
        family_id: familyId,
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
        adjustment_type: adjustmentType,
        event_handling: eventHandling,
        notes: notes.trim() || null,
        scope_type: selectedScope,
      });

      console.log('[AdjustScheduleModal] Schedule adjustment response:', {
        hasError: !!response.error,
        hasData: !!response.data,
        data: response.data,
        error: response.error,
        eventsHandled: response.data?.events_handled,
        diffCount: response.data?.diff?.length || 0,
      });

      // Check for errors first
      if (response.error || !response.data) {
        const errorMessage = response.error?.message || response.error || 'Failed to adjust schedule';
        console.error('[AdjustScheduleModal] Schedule adjustment error:', response.error);
        toast.push(`Failed to adjust schedule: ${errorMessage}`, 'error');
        return; // Exit early on error
      }

      // Handle diff response if present - trigger diff modal via custom event
      // The PlannerDiffModal will listen for this event and open automatically
      if (response.data?.diff && Array.isArray(response.data.diff) && response.data.diff.length > 0) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scheduleDiffAvailable', {
            detail: { diff: response.data.diff }
          }));
        }
      }

      // Log schedule adjustment action
      logScheduleAdjusted(
        adjustmentType,
        startDate,
        endDate || startDate,
        selectedScope === 'child' ? selectedChildId : undefined
      );

      // Show user feedback about events moved
      const eventsHandled = response.data?.events_handled || {};
      const totalEvents = (eventsHandled.backlogged || 0) + (eventsHandled.canceled || 0) + (eventsHandled.rescheduled || 0);
      
      console.log('[AdjustScheduleModal] Events handled details:', {
        eventsHandled,
        totalEvents,
        backlogged: eventsHandled.backlogged,
        canceled: eventsHandled.canceled,
        rescheduled: eventsHandled.rescheduled,
        fullResponse: response.data,
      });
      
      // Build a clear, comprehensive message about what happened to the events
      let successMessage = 'Schedule adjusted successfully.';
      
      if (totalEvents > 0) {
        const parts = [];
        
        // Always show rescheduled count if any
        if (eventsHandled.rescheduled > 0) {
          parts.push(`${eventsHandled.rescheduled} event${eventsHandled.rescheduled !== 1 ? 's' : ''} ${eventsHandled.rescheduled === 1 ? 'has' : 'have'} been automatically rescheduled to new dates`);
        }
        
        // Always show backlogged count if any
        if (eventsHandled.backlogged > 0) {
          parts.push(`${eventsHandled.backlogged} event${eventsHandled.backlogged !== 1 ? 's' : ''} ${eventsHandled.backlogged === 1 ? 'has' : 'have'} been moved to backlog and will be rescheduled automatically`);
        }
        
        // Always show canceled count if any, with context
        if (eventsHandled.canceled > 0) {
          if (eventHandling === 'reschedule' && eventsHandled.rescheduled === 0 && eventsHandled.canceled > 0) {
            parts.push(`${eventsHandled.canceled} non-task event${eventsHandled.canceled !== 1 ? 's' : ''} ${eventsHandled.canceled === 1 ? 'was' : 'were'} canceled (cannot reschedule events without tasks)`);
          } else if (eventHandling === 'cancel') {
            parts.push(`${eventsHandled.canceled} event${eventsHandled.canceled !== 1 ? 's' : ''} ${eventsHandled.canceled === 1 ? 'was' : 'were'} canceled`);
          } else if (eventHandling === 'backlog') {
            parts.push(`${eventsHandled.canceled} non-task event${eventsHandled.canceled !== 1 ? 's' : ''} ${eventsHandled.canceled === 1 ? 'was' : 'were'} canceled (non-task events cannot be backlogged)`);
          } else {
            parts.push(`${eventsHandled.canceled} event${eventsHandled.canceled !== 1 ? 's' : ''} ${eventsHandled.canceled === 1 ? 'was' : 'were'} canceled`);
          }
        }
        
        // If user expected rescheduling but got canceled, make it extra clear
        if (eventHandling === 'reschedule' && eventsHandled.rescheduled === 0 && eventsHandled.backlogged === 0 && eventsHandled.canceled > 0) {
          successMessage = `Schedule adjusted. ${eventsHandled.canceled} event${eventsHandled.canceled !== 1 ? 's' : ''} ${eventsHandled.canceled === 1 ? 'was' : 'were'} canceled (these events cannot be rescheduled because they are not linked to tasks).`;
        } else if (parts.length > 0) {
          successMessage += ` ${parts.join(', ')}.`;
        }
      } else {
        successMessage += ' No events found in this date range.';
      }
      
      console.log('[AdjustScheduleModal] Showing success message:', successMessage);
      console.log('[AdjustScheduleModal] Event handling breakdown:', {
        rescheduled: eventsHandled.rescheduled,
        backlogged: eventsHandled.backlogged,
        canceled: eventsHandled.canceled,
        total: totalEvents,
        requestedHandling: eventHandling,
      });
      
      // Reset form
      setStartDate('');
      setEndDate('');
      setAdjustmentType(null);
      setEventHandling('reschedule');
      setNotes('');
      
      // Close modal first
      onClose();
      
      // Show persistent toast after modal closes so it's visible
      setTimeout(() => {
        toast.push(successMessage, 'success', true);
      }, 100);

      // Refresh calendar - extract month/year from the adjusted date
      // Store the date before resetting form
      const adjustedDateStr = normalizedStartDate;
      const adjustedEndDateStr = normalizedEndDate;
      
      if (typeof window !== 'undefined') {
        // Force refresh after a delay to ensure backend processing completes
        setTimeout(() => {
          console.log('[AdjustScheduleModal] Starting calendar refresh for date:', adjustedDateStr);
          
          // Parse the start date to get month/year for targeted refresh
          // Use noon local time to avoid timezone issues when creating Date object
          const adjustedDate = new Date(adjustedDateStr + 'T12:00:00'); 
          const targetMonth = adjustedDate.getMonth(); // 0-based (0 = January, 10 = November)
          const targetYear = adjustedDate.getFullYear();
          const targetMonthNum = targetMonth + 1; // 1-based for loadMonthData (1 = January, 11 = November)
          
          console.log('[AdjustScheduleModal] Refresh target:', { 
            targetMonth, 
            targetMonthNum,
            targetYear, 
            adjustedDateStr,
            adjustedDate: adjustedDate.toISOString(),
          });
          
          // Clear the calendar cache for this month to force fresh data
          // Note: monthKey format in WebContent is `${year}-${monthIndex}` (0-based month)
          // So November (month 11) = index 10, monthKey = "2025-10"
          const monthKey = `${targetYear}-${targetMonth}`;
          console.log('[AdjustScheduleModal] Month key for cache clear:', monthKey, '(month index', targetMonth, '= month', targetMonthNum, ')');
          
          if (window.__clearCalendarCache) {
            console.log('[AdjustScheduleModal] Clearing calendar cache for month:', monthKey);
            window.__clearCalendarCache(monthKey);
          }
          
          // Also try to trigger loadMonthData directly if available
          if (window.__loadMonthData) {
            console.log('[AdjustScheduleModal] Calling window.__loadMonthData directly');
            window.__loadMonthData(targetYear, targetMonthNum);
          }
          
          // Dispatch refresh events
          const refreshEvent = new CustomEvent('refreshCalendar', { 
            detail: { 
              skipHomeRefresh: true,
              targetMonth: targetMonth,
              targetYear: targetYear,
            } 
          });
          window.dispatchEvent(refreshEvent);
          console.log('[AdjustScheduleModal] Dispatched refreshCalendar event');
          
          const plannerRefreshEvent = new CustomEvent('refreshPlannerWeek');
          window.dispatchEvent(plannerRefreshEvent);
          console.log('[AdjustScheduleModal] Dispatched refreshPlannerWeek event');
          
          // Try direct refresh if available - with multiple attempts
          if (window.__refreshCalendarData) {
            console.log('[AdjustScheduleModal] Calling window.__refreshCalendarData directly');
            window.__refreshCalendarData(adjustedDate);
          } else {
            console.warn('[AdjustScheduleModal] window.__refreshCalendarData not available, will rely on event listeners');
            // Retry after another delay in case the function becomes available
            setTimeout(() => {
              if (window.__refreshCalendarData) {
                console.log('[AdjustScheduleModal] Retry: Calling window.__refreshCalendarData');
                window.__refreshCalendarData(adjustedDate);
              }
            }, 1500);
          }
        }, 1500); // Increased delay to ensure backend processing completes
      }
    } catch (error) {
      console.error('Error adjusting schedule:', error);
      toast.push(`Failed to adjust schedule: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setStartDate('');
    setEndDate('');
    setAdjustmentType(null);
    setEventHandling('reschedule');
    setNotes('');
    onClose();
  };

  const canSave = startDate && adjustmentType && !saving;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay} onTouchEnd={handleCancel}>
        <View style={styles.modal} onTouchEnd={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Adjust Schedule</Text>
              <Text style={styles.headerSubtitle}>
                Learning hours, days off, and special exceptions.
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
          >
            {/* Person Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Whose schedule are we editing?</Text>
              <AvailabilityScopeSwitcher
                selectedScope={selectedScope}
                selectedChildId={selectedChildId}
                children={children}
                onScopeChange={handleScopeChange}
              />
            </View>

            {/* Date Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Date(s)</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateInputContainer}>
                  <Text style={styles.dateLabel}>Start</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={styles.webDateInput}
                    />
                  ) : (
                    <TextInput
                      style={styles.dateInput}
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                    />
                  )}
                </View>
                <View style={styles.dateInputContainer}>
                  <Text style={styles.dateLabel}>End (optional)</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      style={styles.webDateInput}
                    />
                  ) : (
                    <TextInput
                      style={styles.dateInput}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                    />
                  )}
                </View>
              </View>
              {(isSingleDay || isRange) && (
                <Text style={styles.dateHint}>
                  {isSingleDay ? 'Single day selected' : `Range selected: ${startDate} to ${endDate}`}
                </Text>
              )}
            </View>

            {/* Adjustment Type Chips */}
            {(isSingleDay || isRange) && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Adjustment Type</Text>
                <View style={styles.chipsContainer}>
                  {(isRange ? multiDayChips : singleDayChips).map((chip) => (
                    <SelectableChip
                      key={chip.value}
                      label={chip.label}
                      selected={adjustmentType === chip.value}
                      onPress={() => setAdjustmentType(chip.value)}
                      icon={Calendar}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Event Handling Section */}
            {adjustmentType && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Events on these dates</Text>
                <Text style={styles.sectionDescription}>
                  Choose what happens to scheduled learning sessions on these dates.
                </Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setEventHandling('reschedule')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radio}>
                      {eventHandling === 'reschedule' && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.radioContent}>
                      <Text style={styles.radioLabel}>Reschedule automatically (recommended)</Text>
                      <Text style={styles.radioDescription}>
                        Tasks will be moved to backlog and AI will reschedule them to future available dates.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setEventHandling('backlog')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radio}>
                      {eventHandling === 'backlog' && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.radioContent}>
                      <Text style={styles.radioLabel}>Move to backlog</Text>
                      <Text style={styles.radioDescription}>
                        Tasks will be moved to backlog for you to schedule manually later.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setEventHandling('cancel')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radio}>
                      {eventHandling === 'cancel' && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.radioContent}>
                      <Text style={styles.radioLabel}>Cancel events (non-task only)</Text>
                      <Text style={styles.radioDescription}>
                        Only standalone events will be canceled. Task-backed events cannot be canceled.
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g., Family trip, testing week, doctor appointment..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Any changes here affect planning, rebalancing, and AI proposals.
            </Text>
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.7}
              >
                <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
                  {saving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  closeButton: {
    padding: 4,
    marginLeft: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputContainer: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
    fontWeight: '500',
  },
  dateInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  webDateInput: {
    width: '100%',
    padding: '10px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontFamily: 'inherit',
  },
  dateHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
    fontStyle: 'italic',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7c8cff',
  },
  radioContent: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  radioDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  notesInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
  },
  saveButtonDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#9ca3af',
  },
});

