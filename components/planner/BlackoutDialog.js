import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Platform, Alert } from 'react-native';
import { X, Calendar, AlertCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { createBlackout } from '../../lib/apiClient';
import { formatDate } from '../../lib/apiClient';

export default function BlackoutDialog({ 
  visible, 
  onClose, 
  familyId,
  children = [],
  onBlackoutCreated 
}) {
  const [selectedChildId, setSelectedChildId] = useState(null); // null = all children
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  console.log('BlackoutDialog rendered, visible:', visible);

  const handleSubmit = async () => {
    if (!startsOn || !endsOn) {
      Alert.alert('Error', 'Please select start and end dates');
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startsOn) || !dateRegex.test(endsOn)) {
      Alert.alert('Error', 'Please enter dates in YYYY-MM-DD format (e.g., 2025-11-15)');
      return;
    }

    // Validate dates are valid
    const startDate = new Date(startsOn);
    const endDate = new Date(endsOn);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      Alert.alert('Error', 'Invalid date values. Please check your dates.');
      return;
    }

    if (startDate > endDate) {
      Alert.alert('Error', 'End date must be after start date');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await createBlackout({
        familyId,
        childId: selectedChildId,
        startsOn,
        endsOn,
        reason: reason || 'blackout',
      });

      if (error) {
        throw error;
      }

      Alert.alert('Success', `Blackout added · ${data?.overridesCreated || 0} days off`);
      
      // Reset form
      setSelectedChildId(null);
      setStartsOn('');
      setEndsOn('');
      setReason('');
      
      onBlackoutCreated?.(data);
      onClose();
    } catch (err) {
      console.error('Error creating blackout:', err);
      const errorMessage = err?.message || err?.error || 'Failed to create blackout';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleToday = () => {
    const today = formatDate(new Date());
    setStartsOn(today);
    setEndsOn(today);
  };

  const handleNextWeek = () => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setStartsOn(formatDate(today));
    setEndsOn(formatDate(nextWeek));
  };

  // Always render Modal component, let it handle visibility
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} nativeID="blackout-dialog-overlay">
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Calendar size={20} color={colors.primary} />
              <Text style={styles.title}>Add Blackout Period</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Child Selection */}
            <View style={styles.section}>
              <Text style={styles.label}>Child (optional)</Text>
              <View style={styles.childOptions}>
                <TouchableOpacity
                  style={[
                    styles.childOption,
                    selectedChildId === null && styles.childOptionSelected
                  ]}
                  onPress={() => setSelectedChildId(null)}
                >
                  <Text style={[
                    styles.childOptionText,
                    selectedChildId === null && styles.childOptionTextSelected
                  ]}>
                    All Children
                  </Text>
                </TouchableOpacity>
                {children.map(child => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childOption,
                      selectedChildId === child.id && styles.childOptionSelected
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text style={[
                      styles.childOptionText,
                      selectedChildId === child.id && styles.childOptionTextSelected
                    ]}>
                      {child.first_name || child.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date Selection */}
            <View style={styles.section}>
              <Text style={styles.label}>Dates</Text>
              <View style={styles.dateInputs}>
                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>Start</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={startsOn}
                    onChangeText={setStartsOn}
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>End</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={endsOn}
                    onChangeText={setEndsOn}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
              <View style={styles.quickButtons}>
                <TouchableOpacity
                  style={styles.quickButton}
                  onPress={handleToday}
                >
                  <Text style={styles.quickButtonText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickButton}
                  onPress={handleNextWeek}
                >
                  <Text style={styles.quickButtonText}>Next Week</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reason */}
            <View style={styles.section}>
              <Text style={styles.label}>Reason (optional)</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="e.g., Family trip, Holiday"
                value={reason}
                onChangeText={setReason}
                placeholderTextColor={colors.muted}
                multiline
              />
            </View>

            {/* Info */}
            <View style={styles.infoBox}>
              <AlertCircle size={16} color={colors.blueBold} />
              <Text style={styles.infoText}>
                This will create schedule overrides for each day in the range, blocking all scheduled events.
              </Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Creating...' : 'Create Blackout'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999999,
    }),
  },
  modal: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    ...shadows.md,
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 9999999,
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  childOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  childOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  childOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  childOptionTextSelected: {
    color: colors.accent,
    fontWeight: '500',
  },
  dateInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    gap: 6,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  input: {
    padding: 12,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontSize: 14,
    color: colors.text,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusSm,
    backgroundColor: colors.blueSoft,
  },
  quickButtonText: {
    fontSize: 12,
    color: colors.blueBold,
  },
  reasonInput: {
    padding: 12,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.blueSoft,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
});

