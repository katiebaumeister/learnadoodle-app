import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { Calendar } from 'lucide-react';

const PRESETS = [
  { id: 'thisWeek', label: 'This Week', icon: Calendar },
  { id: 'nextWeek', label: 'Next Week', icon: Calendar },
  { id: 'longWeekend', label: 'Long Weekend', icon: Calendar },
  { id: 'travelWeek', label: 'Travel Week', icon: Calendar },
  { id: 'holidayWeek', label: 'Holiday Week', icon: Calendar },
];

/**
 * InlineTimeOffEditor Component
 * Editor for adding time off periods with presets
 */
export default function InlineTimeOffEditor({
  onAddTimeOff,
  onCancel,
}) {
  const [preset, setPreset] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [clearEvents, setClearEvents] = useState(true);

  const handlePresetClick = (presetId) => {
    setPreset(presetId);
    const today = new Date();
    let start, end;

    switch (presetId) {
      case 'thisWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 1);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'nextWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 8);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'longWeekend':
        start = new Date(today);
        const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
        start.setDate(today.getDate() + daysUntilFriday);
        end = new Date(start);
        end.setDate(start.getDate() + 3);
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

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleAdd = () => {
    if (!startDate || !endDate) {
      return;
    }

    onAddTimeOff({
      start: startDate,
      end: endDate,
      reason: reason.trim() || null,
      preset: preset,
      clearEvents,
    });

    // Reset
    setPreset(null);
    setStartDate('');
    setEndDate('');
    setReason('');
    setClearEvents(true);
  };

  return (
    <View style={styles.container}>
      {/* Preset chips */}
      <View style={styles.presetsRow}>
        {PRESETS.map((p) => {
          const Icon = p.icon;
          const isSelected = preset === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.presetChip, isSelected && styles.presetChipSelected]}
              onPress={() => handlePresetClick(p.id)}
              activeOpacity={0.7}
            >
              <Icon size={14} color={isSelected ? '#4338ca' : '#6b7280'} />
              <Text style={[styles.presetText, isSelected && styles.presetTextSelected]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date range pickers */}
      <View style={styles.datePickers}>
        <View style={styles.datePicker}>
          <Text style={styles.dateLabel}>Start</Text>
          <TextInput
            style={styles.dateInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.datePicker}>
          <Text style={styles.dateLabel}>End</Text>
          <TextInput
            style={styles.dateInput}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      {/* Reason */}
      <View style={styles.reasonSection}>
        <Text style={styles.reasonLabel}>Reason (optional)</Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g., Family trip, Testing week..."
          placeholderTextColor="#9ca3af"
        />
      </View>

      {/* Clear events toggle */}
      <TouchableOpacity
        style={styles.clearEventsRow}
        onPress={() => setClearEvents((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, clearEvents && styles.checkboxChecked]}>
          {clearEvents && <View style={styles.checkboxDot} />}
        </View>
        <View style={styles.clearEventsCopy}>
          <Text style={styles.clearEventsTitle}>Clear scheduled events</Text>
          <Text style={styles.clearEventsSubtext}>
            Automatically remove any sessions already placed on these days.
          </Text>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.addButton, (!startDate || !endDate) && styles.addButtonDisabled]}
          onPress={handleAdd}
          disabled={!startDate || !endDate}
          activeOpacity={0.7}
        >
          <Text style={[styles.addButtonText, (!startDate || !endDate) && styles.addButtonTextDisabled]}>
            Add Time Off
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  presetChipSelected: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
  },
  presetText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  presetTextSelected: {
    color: '#4338ca',
  },
  datePickers: {
    flexDirection: 'row',
    gap: 12,
  },
  datePicker: {
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
  reasonSection: {
    gap: 6,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  reasonInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
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
  addButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
  },
  addButtonDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: '#9ca3af',
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
});
