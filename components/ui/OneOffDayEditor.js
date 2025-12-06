import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { Clock } from 'lucide-react';

/**
 * OneOffDayEditor Component
 * Inline editor for one-off day adjustments
 */
export default function OneOffDayEditor({
  date,
  existingOverride,
  onSave,
  onCancel,
}) {
  const [adjustmentType, setAdjustmentType] = useState(
    existingOverride?.override_kind === 'day_off' ? 'no_school' :
    existingOverride?.override_kind ? 'custom' : 'shorter'
  );
  const [startTime, setStartTime] = useState(existingOverride?.start_time || '09:00');
  const [endTime, setEndTime] = useState(existingOverride?.end_time || '15:00');
  const [notes, setNotes] = useState(existingOverride?.notes || '');
  const [clearEvents, setClearEvents] = useState(true); // Default to clearing events for "No School"

  const handleSave = () => {
    let overrideKind = null;
    let overrideData = {};

    switch (adjustmentType) {
      case 'no_school':
        overrideKind = 'day_off';
        break;
      case 'shorter':
        overrideKind = 'late_start';
        overrideData = { start_time: '10:00', end_time: endTime };
        break;
      case 'custom':
        overrideKind = 'activity_default';
        overrideData = { start_time: startTime, end_time: endTime };
        break;
    }

    onSave({
      date,
      override_kind: overrideKind,
      ...overrideData,
      notes: notes.trim() || null,
      clearEvents: adjustmentType === 'no_school' ? clearEvents : false, // Only relevant for "No School"
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Adjust {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
      </View>

      {/* Radio buttons */}
      <View style={styles.options}>
        <TouchableOpacity
          style={[styles.option, adjustmentType === 'shorter' && styles.optionSelected]}
          onPress={() => setAdjustmentType('shorter')}
          activeOpacity={0.7}
        >
          <View style={[styles.radio, adjustmentType === 'shorter' && styles.radioSelected]}>
            {adjustmentType === 'shorter' && <View style={styles.radioDot} />}
          </View>
          <Text style={[styles.optionText, adjustmentType === 'shorter' && styles.optionTextSelected]}>
            Shorter Day
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, adjustmentType === 'no_school' && styles.optionSelected]}
          onPress={() => setAdjustmentType('no_school')}
          activeOpacity={0.7}
        >
          <View style={[styles.radio, adjustmentType === 'no_school' && styles.radioSelected]}>
            {adjustmentType === 'no_school' && <View style={styles.radioDot} />}
          </View>
          <Text style={[styles.optionText, adjustmentType === 'no_school' && styles.optionTextSelected]}>
            No School
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, adjustmentType === 'custom' && styles.optionSelected]}
          onPress={() => setAdjustmentType('custom')}
          activeOpacity={0.7}
        >
          <View style={[styles.radio, adjustmentType === 'custom' && styles.radioSelected]}>
            {adjustmentType === 'custom' && <View style={styles.radioDot} />}
          </View>
          <Text style={[styles.optionText, adjustmentType === 'custom' && styles.optionTextSelected]}>
            Custom Hours
          </Text>
        </TouchableOpacity>
      </View>

      {/* Custom hours pickers */}
      {adjustmentType === 'custom' && (
        <View style={styles.timePickers}>
          <View style={styles.timePicker}>
            <Text style={styles.timeLabel}>Start</Text>
            <TextInput
              style={styles.timeInput}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
            />
          </View>
          <View style={styles.timePicker}>
            <Text style={styles.timeLabel}>End</Text>
            <TextInput
              style={styles.timeInput}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="15:00"
            />
          </View>
        </View>
      )}

      {/* Notes */}
      <View style={styles.notesSection}>
        <Text style={styles.notesLabel}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., Doctor appointment, early dismissal..."
          multiline
          numberOfLines={2}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>Save Adjustment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  header: {
    marginBottom: 16,
  },
  headerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  options: {
    gap: 12,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  optionSelected: {
    borderColor: '#7c8cff',
    backgroundColor: '#f0f4ff',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#7c8cff',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7c8cff',
  },
  optionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#4338ca',
  },
  timePickers: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  timePicker: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
    fontWeight: '500',
  },
  timeInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  notesSection: {
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
    fontWeight: '500',
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
  clearEventsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f7',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    borderColor: '#7c8cff',
    backgroundColor: '#e0e7ff',
  },
  checkboxDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7c8cff',
  },
  clearEventsCopy: {
    flex: 1,
  },
  clearEventsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  clearEventsSubtext: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
  },
  saveButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
});
