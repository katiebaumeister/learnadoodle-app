import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const OVERRIDE_KINDS = [
  { id: 'day_off', label: 'Day Off', description: 'No teaching for the entire day' },
  { id: 'late_start', label: 'Late Start', description: 'Start teaching later than usual' },
  { id: 'early_end', label: 'Early End', description: 'End teaching earlier than usual' },
  { id: 'extra_block', label: 'Extra Block', description: 'Add an additional teaching block' },
];

const OverridesDrawer = ({
  familyId,
  children,
  selectedScope,
  selectedChildId,
  onScopeChange,
  onOverrideSaved,
  existingOverrides,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOverride, setNewOverride] = useState({
    date: new Date().toISOString().split('T')[0],
    override_kind: 'day_off',
    start_time: null,
    end_time: null,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleOverrideKindChange = (kind) => {
    setNewOverride(prev => ({
      ...prev,
      override_kind: kind,
      start_time: kind === 'late_start' ? '10:00' : null,
      end_time: kind === 'early_end' ? '14:00' : null,
    }));
  };

  const handleTimeChange = (field, time) => {
    setNewOverride(prev => ({
      ...prev,
      [field]: time
    }));
  };

  const validateOverride = () => {
    if (!newOverride.date) {
      showAlert('Validation Error', 'Please select a date');
      return false;
    }
    
    if (newOverride.override_kind === 'late_start' && !newOverride.start_time) {
      showAlert('Validation Error', 'Please select a start time for late start');
      return false;
    }
    
    if (newOverride.override_kind === 'early_end' && !newOverride.end_time) {
      showAlert('Validation Error', 'Please select an end time for early end');
      return false;
    }
    
    return true;
  };

  const saveOverride = async () => {
    if (!validateOverride()) return;
    
    try {
      setSaving(true);
      
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      const { error } = await supabase
        .from('schedule_overrides')
        .insert({
          scope_type: selectedScope,
          scope_id: scopeId,
          date: newOverride.date,
          override_kind: newOverride.override_kind,
          start_time: newOverride.start_time,
          end_time: newOverride.end_time,
          notes: newOverride.notes,
          source: 'manual',
          is_active: true
        });

      if (error) throw error;
      
      // Reset form
      setNewOverride({
        date: new Date().toISOString().split('T')[0],
        override_kind: 'day_off',
        start_time: null,
        end_time: null,
        notes: '',
      });
      setShowAddForm(false);
      
      onOverrideSaved();
    } catch (error) {
      console.error('Error saving override:', error);
      showAlert('Error', 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const deleteOverride = async (overrideId) => {
    try {
      const { error } = await supabase
        .from('schedule_overrides')
        .update({ is_active: false })
        .eq('id', overrideId);

      if (error) throw error;
      onOverrideSaved();
    } catch (error) {
      console.error('Error deleting override:', error);
      showAlert('Error', 'Failed to delete override');
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time) => {
    return time ? time.substring(0, 5) : '';
  };

  const getOverrideKindLabel = (kind) => {
    return OVERRIDE_KINDS.find(o => o.id === kind)?.label || kind;
  };

  const renderExistingOverrides = () => (
    <View style={styles.existingOverridesContainer}>
      <Text style={styles.sectionTitle}>Existing Overrides</Text>
      {existingOverrides.length === 0 ? (
        <Text style={styles.emptyState}>No overrides defined yet</Text>
      ) : (
        existingOverrides.map(override => (
          <View key={override.id} style={styles.overrideCard}>
            <View style={styles.overrideHeader}>
              <Text style={styles.overrideDate}>{formatDate(override.date)}</Text>
              <TouchableOpacity
                onPress={() => deleteOverride(override.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.overrideKind}>
              {getOverrideKindLabel(override.override_kind)}
            </Text>
            {(override.start_time || override.end_time) && (
              <Text style={styles.overrideTime}>
                {override.start_time && override.end_time
                  ? `${formatTime(override.start_time)} - ${formatTime(override.end_time)}`
                  : override.start_time
                  ? `Start: ${formatTime(override.start_time)}`
                  : `End: ${formatTime(override.end_time)}`
                }
              </Text>
            )}
            {override.notes && (
              <Text style={styles.overrideNotes}>{override.notes}</Text>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderAddForm = () => (
    <View style={styles.addFormContainer}>
      <Text style={styles.sectionTitle}>Add New Override</Text>
      
      {/* Date */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Date</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => {
            showAlert('Date Picker', 'Date picker would open here');
          }}
        >
          <Text style={styles.textInputText}>
            {formatDate(newOverride.date)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Override Kind */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Override Type</Text>
        <View style={styles.overrideKindContainer}>
          {OVERRIDE_KINDS.map(kind => (
            <TouchableOpacity
              key={kind.id}
              style={[
                styles.overrideKindButton,
                newOverride.override_kind === kind.id && styles.overrideKindButtonActive
              ]}
              onPress={() => handleOverrideKindChange(kind.id)}
            >
              <Text style={[
                styles.overrideKindButtonText,
                newOverride.override_kind === kind.id && styles.overrideKindButtonTextActive
              ]}>
                {kind.label}
              </Text>
              <Text style={[
                styles.overrideKindDescription,
                newOverride.override_kind === kind.id && styles.overrideKindDescriptionActive
              ]}>
                {kind.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Conditional Time Inputs */}
      {newOverride.override_kind === 'late_start' && (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Start Time</Text>
          <TouchableOpacity
            style={styles.textInput}
            onPress={() => {
              showAlert('Time Picker', 'Time picker would open here');
            }}
          >
            <Text style={styles.textInputText}>
              {formatTime(newOverride.start_time) || 'Select time...'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {newOverride.override_kind === 'early_end' && (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>End Time</Text>
          <TouchableOpacity
            style={styles.textInput}
            onPress={() => {
              showAlert('Time Picker', 'Time picker would open here');
            }}
          >
            <Text style={styles.textInputText}>
              {formatTime(newOverride.end_time) || 'Select time...'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(newOverride.override_kind === 'extra_block' || newOverride.override_kind === 'late_start') && (
        <View style={styles.timeContainer}>
          {newOverride.override_kind === 'late_start' && (
            <View style={styles.timeInputContainer}>
              <Text style={styles.timeLabel}>End Time (optional)</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => {
                  showAlert('Time Picker', 'Time picker would open here');
                }}
              >
                <Text style={styles.timeButtonText}>
                  {formatTime(newOverride.end_time) || 'Select time...'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {newOverride.override_kind === 'extra_block' && (
            <>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    showAlert('Time Picker', 'Time picker would open here');
                  }}
                >
                  <Text style={styles.timeButtonText}>
                    {formatTime(newOverride.start_time) || 'Select time...'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>End Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    showAlert('Time Picker', 'Time picker would open here');
                  }}
                >
                  <Text style={styles.timeButtonText}>
                    {formatTime(newOverride.end_time) || 'Select time...'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* Notes */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Notes (optional)</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => {
            showAlert('Text Input', 'Text input would open here');
          }}
        >
          <Text style={styles.textInputText}>
            {newOverride.notes || 'Add a note...'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setShowAddForm(false)}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveOverride}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Override'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderExistingOverrides()}
      
      {!showAddForm ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
        >
          <Text style={styles.addButtonText}>+ Add New Override</Text>
        </TouchableOpacity>
      ) : (
        renderAddForm()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  existingOverridesContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  emptyState: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  overrideCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  overrideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  overrideDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  overrideKind: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
    marginBottom: 4,
  },
  overrideTime: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  overrideNotes: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  addFormContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  textInputText: {
    fontSize: 16,
    color: '#111827',
  },
  overrideKindContainer: {
    gap: 8,
  },
  overrideKindButton: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  overrideKindButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  overrideKindButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 2,
  },
  overrideKindButtonTextActive: {
    color: '#ffffff',
  },
  overrideKindDescription: {
    fontSize: 12,
    color: '#9ca3af',
  },
  overrideKindDescriptionActive: {
    color: '#dbeafe',
  },
  timeContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  timeButton: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
    color: '#111827',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
});

export default OverridesDrawer;
