import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
  { id: 0, name: 'Sunday', short: 'Sun' },
];

const WeeklyTemplateEditor = ({
  familyId,
  children,
  selectedScope,
  selectedChildId,
  onScopeChange,
  onRuleSaved,
  existingRules,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState({
    title: '',
    rule_kind: 'teach', // 'teach' or 'off'
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year from now
    start_time: '09:00',
    end_time: '15:00',
    selected_days: [],
  });
  const [saving, setSaving] = useState(false);

  const handleDayToggle = (dayId) => {
    setNewRule(prev => ({
      ...prev,
      selected_days: prev.selected_days.includes(dayId)
        ? prev.selected_days.filter(id => id !== dayId)
        : [...prev.selected_days, dayId]
    }));
  };

  const handleTimeChange = (field, time) => {
    setNewRule(prev => ({
      ...prev,
      [field]: time
    }));
  };

  const validateRule = () => {
    if (!newRule.title.trim()) {
      showAlert('Validation Error', 'Please enter a title for the rule');
      return false;
    }
    
    if (newRule.selected_days.length === 0) {
      showAlert('Validation Error', 'Please select at least one day of the week');
      return false;
    }
    
    if (newRule.start_time >= newRule.end_time) {
      showAlert('Validation Error', 'End time must be after start time');
      return false;
    }
    
    return true;
  };

  const saveRule = async () => {
    if (!validateRule()) return;
    
    try {
      setSaving(true);
      
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      // Build RRULE JSON
      const rrule = {
        freq: 'WEEKLY',
        byweekday: newRule.selected_days,
        interval: 1
      };
      
      const { error } = await supabase
        .from('schedule_rules')
        .insert({
          scope_type: selectedScope,
          scope_id: scopeId,
          rule_kind: newRule.rule_kind,
          title: newRule.title,
          start_date: newRule.start_date,
          end_date: newRule.end_date,
          start_time: newRule.start_time,
          end_time: newRule.end_time,
          rrule: rrule,
          source: 'manual',
          is_active: true
        });

      if (error) throw error;
      
      // Reset form
      setNewRule({
        title: '',
        rule_kind: 'teach',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '15:00',
        selected_days: [],
      });
      setShowAddForm(false);
      
      onRuleSaved();
    } catch (error) {
      console.error('Error saving rule:', error);
      showAlert('Error', 'Failed to save schedule rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (ruleId) => {
    try {
      const { error } = await supabase
        .from('schedule_rules')
        .update({ is_active: false })
        .eq('id', ruleId);

      if (error) throw error;
      onRuleSaved();
    } catch (error) {
      console.error('Error deleting rule:', error);
      showAlert('Error', 'Failed to delete schedule rule');
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatTime = (time) => {
    return time.substring(0, 5); // Remove seconds if present
  };

  const getDayName = (dayId) => {
    return DAYS_OF_WEEK.find(day => day.id === dayId)?.short || '';
  };

  const renderTimeInput = (label, field, value) => (
    <View style={styles.timeInputContainer}>
      <Text style={styles.timeLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        <input
          type="time"
          value={value}
          onChange={(e) => handleTimeChange(field, e.target.value)}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 6,
            padding: 8,
            borderWidth: 1,
            borderColor: '#e1e5e9',
            borderStyle: 'solid',
            fontSize: 12,
            color: '#111827',
            textAlign: 'center',
            minHeight: 36,
            width: '100%',
            outline: 'none',
          }}
        />
      ) : (
        <TextInput
          style={styles.timeInput}
          value={formatTime(value)}
          onChangeText={(text) => {
            // Auto-format time input
            let formattedText = text;
            
            // Remove any non-digit characters except colon
            formattedText = formattedText.replace(/[^\d:]/g, '');
            
            // Auto-add colon after 2 digits
            if (formattedText.length === 2 && !formattedText.includes(':')) {
              formattedText += ':';
            }
            
            // Limit to HH:MM format
            if (formattedText.length <= 5) {
              handleTimeChange(field, formattedText);
            }
          }}
          placeholder="HH:MM"
          placeholderTextColor="#999"
          maxLength={5}
        />
      )}
    </View>
  );

  const renderExistingRules = () => (
    <View style={styles.existingRulesContainer}>
      <Text style={styles.sectionTitle}>Existing Rules</Text>
      {existingRules.length === 0 ? (
        <Text style={styles.emptyState}>No rules defined yet</Text>
      ) : (
        existingRules.map(rule => (
          <View key={rule.id} style={styles.ruleCard}>
            <View style={styles.ruleHeader}>
              <View style={styles.ruleTitleRow}>
                <Text style={styles.ruleTitle}>{rule.title}</Text>
                <View style={[
                  styles.ruleKindBadge,
                  rule.rule_kind === 'teach' ? styles.ruleKindTeach : styles.ruleKindOff
                ]}>
                  <Text style={styles.ruleKindText}>
                    {rule.rule_kind === 'teach' ? 'Add Time' : 'Block Time'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => deleteRule(rule.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.ruleDetails}>
              {rule.start_time} - {rule.end_time}
            </Text>
            <Text style={styles.ruleDetails}>
              Days: {rule.rrule?.byweekday?.map(dayId => getDayName(dayId)).join(', ')}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  const renderAddForm = () => (
    <View style={styles.addFormContainer}>
      <Text style={styles.sectionTitle}>Add New Rule</Text>
      
      {/* Title */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.textInput}
          value={newRule.title}
          onChangeText={(text) => setNewRule(prev => ({ ...prev, title: text }))}
          placeholder="Enter rule title..."
          placeholderTextColor="#999"
        />
      </View>

      {/* Rule Kind */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Rule Kind</Text>
        <View style={styles.ruleTypeContainer}>
          <TouchableOpacity
            style={[
              styles.ruleTypeButton,
              newRule.rule_kind === 'teach' && styles.ruleTypeButtonActive
            ]}
            onPress={() => setNewRule(prev => ({ ...prev, rule_kind: 'teach' }))}
          >
            <Text style={[
              styles.ruleTypeButtonText,
              newRule.rule_kind === 'teach' && styles.ruleTypeButtonTextActive
            ]}>
              Add Teaching Time
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.ruleTypeButton,
              newRule.rule_kind === 'off' && styles.ruleTypeButtonActive
            ]}
            onPress={() => setNewRule(prev => ({ ...prev, rule_kind: 'off' }))}
          >
            <Text style={[
              styles.ruleTypeButtonText,
              newRule.rule_kind === 'off' && styles.ruleTypeButtonTextActive
            ]}>
              Block Time (Off)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Days of Week */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Days of Week</Text>
        <View style={styles.daysContainer}>
          {DAYS_OF_WEEK.map(day => (
            <TouchableOpacity
              key={day.id}
              style={[
                styles.dayButton,
                newRule.selected_days.includes(day.id) && styles.dayButtonActive
              ]}
              onPress={() => handleDayToggle(day.id)}
            >
              <Text style={[
                styles.dayButtonText,
                newRule.selected_days.includes(day.id) && styles.dayButtonTextActive
              ]}>
                {day.short}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Time Range */}
      <View style={styles.timeContainer}>
        {renderTimeInput('Start Time', 'start_time', newRule.start_time)}
        {renderTimeInput('End Time', 'end_time', newRule.end_time)}
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
          onPress={saveRule}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Rule'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderExistingRules()}
      
      {!showAddForm ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
        >
          <Text style={styles.addButtonText}>+ Add New Rule</Text>
        </TouchableOpacity>
      ) : (
        renderAddForm()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
  },
  existingRulesContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  emptyState: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  ruleCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ruleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  ruleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  ruleKindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ruleKindTeach: {
    backgroundColor: '#e4f5e7',
  },
  ruleKindOff: {
    backgroundColor: '#fde2e4',
  },
  ruleKindText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ef4444',
    borderRadius: 4,
  },
  deleteButtonText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#ffffff',
  },
  ruleDetails: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 3,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  addFormContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    fontSize: 12,
    color: '#111827',
    minHeight: 36,
  },
  textInputText: {
    fontSize: 12,
    color: '#111827',
  },
  ruleTypeContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  ruleTypeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    alignItems: 'center',
  },
  ruleTypeButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  ruleTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  ruleTypeButtonTextActive: {
    color: '#1e40af',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  dayButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  dayButtonTextActive: {
    color: '#1e40af',
  },
  timeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  timeInput: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    fontSize: 12,
    color: '#111827',
    textAlign: 'center',
    minHeight: 36,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default WeeklyTemplateEditor;
