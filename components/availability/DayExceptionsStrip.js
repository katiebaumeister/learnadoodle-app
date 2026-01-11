import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ScrollView } from 'react-native';
import { Clock, X } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

/**
 * Day Exceptions Strip Component
 * Shows upcoming days as chips for quick one-off adjustments
 */
const DayExceptionsStrip = ({
  familyId,
  selectedScope,
  selectedChildId,
  existingOverrides = [],
  onOverrideSaved,
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Generate next 14 days
  const getUpcomingDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
      });
    }
    return days;
  };

  const upcomingDays = getUpcomingDays();

  const getOverrideForDate = (dateStr) => {
    return existingOverrides.find(o => o.date === dateStr);
  };

  const getOverrideBadge = (override) => {
    if (!override) return null;
    
    switch (override.override_kind) {
      case 'day_off':
        return { label: 'Off', color: '#ef4444' };
      case 'late_start':
        return { label: 'Late', color: '#f59e0b' };
      case 'early_end':
        return { label: 'Early', color: '#f59e0b' };
      case 'extra_block':
        return { label: 'Extra', color: '#10b981' };
      default:
        return null;
    }
  };

  const handleDayClick = (dateStr) => {
    setSelectedDate(dateStr);
    setShowModal(true);
  };

  const handleCreateOverride = async (overrideKind, startTime = null, endTime = null) => {
    if (!selectedDate) return;
    
    try {
      setSaving(true);
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      // Delete existing override for this date if any
      await supabase
        .from('schedule_overrides')
        .update({ is_active: false })
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('date', selectedDate);

      // Create new override
      const { error } = await supabase
        .from('schedule_overrides')
        .insert({
          scope_type: selectedScope,
          scope_id: scopeId,
          date: selectedDate,
          override_kind: overrideKind,
          start_time: startTime,
          end_time: endTime,
          source: 'manual',
          is_active: true,
        });

      if (error) throw error;

      setShowModal(false);
      setSelectedDate(null);
      onOverrideSaved();
    } catch (error) {
      alert('Failed to create override');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverride = async () => {
    if (!selectedDate) return;
    
    try {
      setSaving(true);
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      const { error } = await supabase
        .from('schedule_overrides')
        .update({ is_active: false })
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('date', selectedDate);

      if (error) throw error;

      setShowModal(false);
      setSelectedDate(null);
      onOverrideSaved();
    } catch (error) {
      alert('Failed to delete override');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {upcomingDays.map(day => {
          const override = getOverrideForDate(day.date);
          const badge = getOverrideBadge(override);
          
          return (
            <TouchableOpacity
              key={day.date}
              style={[
                styles.dayChip,
                badge && styles.dayChipWithBadge,
              ]}
              onPress={() => handleDayClick(day.date)}
            >
              <Text style={styles.dayName}>{day.dayName}</Text>
              <Text style={styles.dayNumber}>{day.dayNumber}</Text>
              {badge && (
                <View style={[styles.badge, { backgroundColor: badge.color }]}>
                  <Text style={styles.badgeText}>{badge.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Exception Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate ? formatDate(selectedDate) : 'Select Date'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.closeButton}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>
                Choose an adjustment for this day:
              </Text>

              <View style={styles.optionsList}>
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => handleCreateOverride('day_off')}
                  disabled={saving}
                >
                  <Text style={styles.optionButtonText}>Day Off</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => {
                    // For now, use default late start time
                    // In a full implementation, this would open a time picker
                    handleCreateOverride('late_start', '10:00', null);
                  }}
                  disabled={saving}
                >
                  <Text style={styles.optionButtonText}>Late Start</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => {
                    handleCreateOverride('early_end', null, '14:00');
                  }}
                  disabled={saving}
                >
                  <Text style={styles.optionButtonText}>Early End</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => {
                    // Short day = late start + early end
                    handleCreateOverride('late_start', '10:00', '14:00');
                  }}
                  disabled={saving}
                >
                  <Text style={styles.optionButtonText}>Short Day</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => {
                    handleCreateOverride('extra_block', '15:00', '16:00');
                  }}
                  disabled={saving}
                >
                  <Text style={styles.optionButtonText}>Add Extra Hours</Text>
                </TouchableOpacity>

                {getOverrideForDate(selectedDate) && (
                  <TouchableOpacity
                    style={[styles.optionButton, styles.deleteOptionButton]}
                    onPress={handleDeleteOverride}
                    disabled={saving}
                  >
                    <Text style={[styles.optionButtonText, styles.deleteOptionText]}>
                      Remove exception
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    gap: 8,
  },
  dayChip: {
    width: 60,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
    ...shadows.sm,
  },
  dayChipWithBadge: {
    borderColor: '#d1d5db',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: colors.radiusMd,
    borderTopRightRadius: colors.radiusMd,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    gap: 16,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  optionsList: {
    gap: 12,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  deleteOptionButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  deleteOptionText: {
    color: '#dc2626',
  },
});

export default DayExceptionsStrip;

