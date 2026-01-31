import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { Calendar, Trash2, MapPin, Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { createBlackout } from '../../lib/apiClient';

/**
 * Breaks and Blackouts Panel Component
 * Calendar range picker and list of upcoming breaks
 */
const BreaksAndBlackoutsPanel = ({
  familyId,
  children = [],
  selectedScope,
  selectedChildId,
  blackouts = [],
  onBlackoutCreated,
  onBlackoutDeleted,
}) => {
  const [selectedStartDate, setSelectedStartDate] = useState(null);
  const [selectedEndDate, setSelectedEndDate] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getChildName = (childId) => {
    if (!childId) return 'All children';
    const child = children.find(c => c.id === childId);
    return child?.first_name || child?.name || 'Unknown';
  };

  const handlePresetClick = (preset) => {
    const today = new Date();
    let start, end;

    switch (preset) {
      case 'thisWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 1); // Monday
        end = new Date(start);
        end.setDate(start.getDate() + 6); // Sunday
        break;
      case 'nextWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 8); // Next Monday
        end = new Date(start);
        end.setDate(start.getDate() + 6); // Sunday
        break;
      case 'longWeekend':
        start = new Date(today);
        // Find next Friday
        const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
        start.setDate(today.getDate() + daysUntilFriday);
        end = new Date(start);
        end.setDate(start.getDate() + 3); // Monday
        break;
      case 'travelWeek':
        start = new Date(today);
        start.setDate(today.getDate() + 7);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'holidayWeek':
        start = new Date(today);
        start.setDate(today.getDate() + 14);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      default:
        return;
    }

    setSelectedStartDate(start.toISOString().split('T')[0]);
    setSelectedEndDate(end.toISOString().split('T')[0]);
    setShowCalendar(true);
  };

  const handleAddBreak = async () => {
    if (!selectedStartDate || !selectedEndDate) {
      Alert.alert('Missing dates', 'Please select start and end dates');
      return;
    }

    try {
      setSaving(true);
      
      const childIdForBlackout = selectedScope === 'child' ? selectedChildId : null;
      
      const { error } = await createBlackout({
        familyId,
        childId: childIdForBlackout,
        startsOn: selectedStartDate,
        endsOn: selectedEndDate,
        reason: reason || 'Break',
      });

      if (error) throw error;

      // Reset form
      setSelectedStartDate(null);
      setSelectedEndDate(null);
      setReason('');
      setShowCalendar(false);

      onBlackoutCreated();
      
      Alert.alert('Success', 'Break added successfully');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create break');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlackout = async (blackoutId) => {
    Alert.alert(
      'Remove break',
      'Are you sure you want to remove this break?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete blackout
              const { error: deleteError } = await supabase
                .from('blackout_periods')
                .delete()
                .eq('id', blackoutId);

              if (deleteError) throw deleteError;

              // Delete associated overrides
              const blackout = blackouts.find(b => b.id === blackoutId);
              if (blackout) {
                const start = new Date(blackout.starts_on);
                const end = new Date(blackout.ends_on);
                const scopeId = blackout.child_id || familyId;
                // NOTE: schedule_overrides removed - override deletion disabled
                // const scopeType = blackout.child_id ? 'child' : 'family';

                // for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                //   const dateStr = d.toISOString().split('T')[0];
                //   await supabase
                //     .from('schedule_overrides')
                //     .update({ is_active: false })
                //     .eq('scope_type', scopeType)
                //     .eq('scope_id', scopeId)
                //     .eq('date', dateStr)
                //     .eq('override_kind', 'day_off');
                // }

                // Refresh cache
                await supabase.rpc('refresh_calendar_days_cache', {
                  p_family_id: familyId,
                  p_from_date: blackout.starts_on,
                  p_to_date: blackout.ends_on,
                });
              }

              onBlackoutDeleted();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete break');
            }
          },
        },
      ]
    );
  };

  const getDaysInRange = () => {
    if (!selectedStartDate || !selectedEndDate) return 0;
    const start = new Date(selectedStartDate);
    const end = new Date(selectedEndDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Filter blackouts based on scope
  const filteredBlackouts = blackouts.filter(blackout => {
    if (selectedScope === 'family') {
      return !blackout.child_id;
    } else if (selectedScope === 'child' && selectedChildId) {
      return blackout.child_id === selectedChildId || !blackout.child_id;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Quick Presets */}
      <View style={styles.presetsSection}>
        <Text style={styles.presetsLabel}>Quick presets:</Text>
        <View style={styles.presetsRow}>
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => handlePresetClick('thisWeek')}
          >
            <Text style={styles.presetButtonText}>This Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => handlePresetClick('nextWeek')}
          >
            <Text style={styles.presetButtonText}>Next Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => handlePresetClick('longWeekend')}
          >
            <Text style={styles.presetButtonText}>Long Weekend ✨</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => handlePresetClick('travelWeek')}
          >
            <Text style={styles.presetButtonText}>Travel Week ✈️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetButton}
            onPress={() => handlePresetClick('holidayWeek')}
          >
            <Text style={styles.presetButtonText}>Holiday Week 🎉</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Range Input */}
      <View style={styles.dateRangeSection}>
        <View style={styles.dateInputRow}>
          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>Start date</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={selectedStartDate || ''}
                onChange={(e) => setSelectedStartDate(e.target.value)}
                style={styles.webDateInput}
              />
            ) : (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => {
                  // In React Native, would open date picker
                  Alert.alert('Date Picker', 'Date picker would open here');
                }}
              >
                <Text style={styles.dateButtonText}>
                  {selectedStartDate ? formatDateShort(selectedStartDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>End date</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={selectedEndDate || ''}
                onChange={(e) => setSelectedEndDate(e.target.value)}
                style={styles.webDateInput}
              />
            ) : (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => {
                  Alert.alert('Date Picker', 'Date picker would open here');
                }}
              >
                <Text style={styles.dateButtonText}>
                  {selectedEndDate ? formatDateShort(selectedEndDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {selectedStartDate && selectedEndDate && (
          <View style={styles.rangeSummary}>
            <Text style={styles.rangeSummaryText}>
              Selected: {formatDate(selectedStartDate)} → {formatDate(selectedEndDate)} ({getDaysInRange()} days)
            </Text>
            <Text style={styles.rangeScopeText}>
              Applies to: {selectedScope === 'family' ? 'All children' : getChildName(selectedChildId)}
            </Text>
          </View>
        )}

        <View style={styles.reasonInputGroup}>
          <Text style={styles.reasonLabel}>Reason (optional)</Text>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Family trip, testing week, etc."
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.addButton, saving && styles.addButtonDisabled]}
          onPress={handleAddBreak}
          disabled={saving || !selectedStartDate || !selectedEndDate}
        >
          <Text style={styles.addButtonText}>
            {saving 
              ? 'Adding...' 
              : selectedStartDate && selectedEndDate
                ? `Add break for ${selectedScope === 'family' ? 'Family' : getChildName(selectedChildId)}`
                : 'Add break'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming Breaks Timeline */}
      <View style={styles.blackoutsSection}>
        <Text style={styles.blackoutsTitle}>Upcoming Time Off</Text>
        {filteredBlackouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No breaks yet. Plan your next trip to keep the schedule realistic.
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {filteredBlackouts.map(blackout => {
              const startDate = new Date(blackout.starts_on);
              const endDate = new Date(blackout.ends_on);
              const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });
              const startDay = startDate.getDate();
              const endDay = endDate.getDate();
              const year = startDate.getFullYear();
              
              // Extract emoji from reason if present
              const emojiMatch = blackout.reason?.match(/[\u{1F300}-\u{1F9FF}]/u);
              const emoji = emojiMatch ? emojiMatch[0] : null;
              const reasonText = blackout.reason?.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() || 'Break';
              
              return (
                <View key={blackout.id} style={styles.timelineItem}>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineReason}>
                        {reasonText} {emoji}
                      </Text>
                      <TouchableOpacity
                        style={styles.timelineDeleteButton}
                        onPress={() => handleDeleteBlackout(blackout.id)}
                      >
                        <Trash2 size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.timelineDates}>
                      {monthName} {startDay}{startDay !== endDay ? `–${endDay}` : ''}, {year}
                    </Text>
                    <Text style={styles.timelineScope}>
                      Applies to: {getChildName(blackout.child_id)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingTop: 0,
  },
  presetsSection: {
    marginBottom: 20,
  },
  presetsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.panel || '#f6f8ff',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  dateRangeSection: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  webDateInput: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    fontSize: 14,
    backgroundColor: colors.card,
  },
  dateButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
  },
  dateButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  rangeSummary: {
    backgroundColor: colors.blueSoft || '#e0f2fe',
    borderRadius: colors.radiusMd,
    padding: 12,
    marginBottom: 12,
  },
  rangeSummaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blueBold || '#0369a1',
    marginBottom: 4,
  },
  rangeScopeText: {
    fontSize: 12,
    color: colors.blueBold || '#0284c7',
  },
  reasonInputGroup: {
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  reasonInput: {
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: colors.radiusMd,
    alignItems: 'center',
    ...shadows.sm,
  },
  addButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  blackoutsSection: {
    marginTop: 8,
  },
  blackoutsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  timeline: {
    gap: 12,
  },
  timelineItem: {
    backgroundColor: colors.panel || '#f6f8ff',
    borderRadius: colors.radiusMd,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  timelineContent: {
    gap: 6,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineReason: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  timelineDeleteButton: {
    padding: 4,
  },
  timelineDates: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  timelineScope: {
    fontSize: 13,
    color: colors.muted,
  },
});

export default BreaksAndBlackoutsPanel;

