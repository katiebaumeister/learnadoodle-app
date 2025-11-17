import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, shadows } from '../theme/colors';
import { X, Save, AlertTriangle } from 'lucide-react';

const AddRuleForm = ({ 
  visible, 
  onClose, 
  familyId, 
  childId, 
  onRuleAdded,
  children = [] 
}) => {
  const [title, setTitle] = useState('');
  const [ruleKind, setRuleKind] = useState('teach'); // 'teach' | 'off'
  const [days, setDays] = useState(['MO', 'TU', 'WE', 'TH', 'FR']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');
  const [scopeType, setScopeType] = useState(childId ? 'child' : 'family');
  const [selectedChildId, setSelectedChildId] = useState(childId);
  const [saving, setSaving] = useState(false);

  const scopeId = selectedChildId || familyId;

  const dayLabels = {
    'MO': 'Mon', 'TU': 'Tue', 'WE': 'Wed', 'TH': 'Thu', 
    'FR': 'Fri', 'SA': 'Sat', 'SU': 'Sun'
  };

  const toggleDay = (day) => {
    setDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const softCheckWarnings = async () => {
    try {
      const { data, error } = await supabase.rpc('detect_rule_conflicts', { 
        _family: familyId 
      });
      
      if (error) return { warnings: [], error };
      
      const warnings = [];
      if (data && data.length > 0) {
        const maskedRules = data.filter(rule => rule.masked_minutes > 0);
        if (maskedRules.length > 0) {
          warnings.push(`${maskedRules.length} existing rule(s) have time that may be masked by Off rules`);
        }
      }
      
      return { warnings, error: null };
    } catch (error) {
      return { warnings: [], error };
    }
  };

  const onSaveRule = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title for the rule');
      return;
    }

    if (days.length === 0) {
      Alert.alert('Error', 'Please select at least one day');
      return;
    }

    if (startTime >= endTime) {
      Alert.alert('Error', 'End time must be after start time');
      return;
    }

    setSaving(true);

    try {
      // Check for warnings
      const { warnings } = await softCheckWarnings();
      
      // Show warnings if any
      if (warnings.length > 0) {
        Alert.alert(
          'Heads up',
          warnings.join('\n'),
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save Anyway', onPress: () => saveRule() }
          ]
        );
        return;
      }

      await saveRule();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async () => {
    const rrule = { 
      freq: 'WEEKLY', 
      byweekday: days 
    };

    const { error } = await supabase.from('schedule_rules').insert({
      title: title.trim(),
      scope_type: scopeType,
      scope_id: scopeId,
      rule_kind: ruleKind,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 365 * 864e5).toISOString().split('T')[0], // 1 year from now
      start_time: startTime,
      end_time: endTime,
      rrule,
      is_active: true
    });

    if (error) {
      throw new Error(error.message);
    }

    // Refresh cache
    const fromDate = new Date();
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 60); // Next 60 days

    await supabase.rpc('refresh_calendar_days_cache', {
      p_family_id: familyId,
      p_from_date: fromDate.toISOString().split('T')[0],
      p_to_date: toDate.toISOString().split('T')[0]
    });

    Alert.alert('Success', 'Rule saved and cache refreshed');
    onRuleAdded();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setRuleKind('teach');
    setDays(['MO', 'TU', 'WE', 'TH', 'FR']);
    setStartTime('09:00');
    setEndTime('15:00');
    setScopeType(childId ? 'child' : 'family');
    setSelectedChildId(childId);
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Add Schedule Rule</Text>
            <Text style={styles.subtitle}>
              {ruleKind === 'teach' 
                ? 'Add teaching time to the schedule' 
                : 'Block time from the schedule'
              }
            </Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Title */}
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <View style={styles.input}>
              <Text
                style={styles.inputText}
                placeholder="e.g., Max's School Days"
                placeholderTextColor={colors.muted}
                value={title}
                onChangeText={setTitle}
              />
            </View>
          </View>

          {/* Rule Type */}
          <View style={styles.field}>
            <Text style={styles.label}>Rule Type</Text>
            <View style={styles.ruleTypeButtons}>
              <TouchableOpacity
                style={[
                  styles.ruleTypeButton,
                  ruleKind === 'teach' && styles.ruleTypeButtonActive
                ]}
                onPress={() => setRuleKind('teach')}
              >
                <Text style={[
                  styles.ruleTypeButtonText,
                  ruleKind === 'teach' && styles.ruleTypeButtonTextActive
                ]}>
                  + Add Teaching Time
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.ruleTypeButton,
                  ruleKind === 'off' && styles.ruleTypeButtonActive
                ]}
                onPress={() => setRuleKind('off')}
              >
                <Text style={[
                  styles.ruleTypeButtonText,
                  ruleKind === 'off' && styles.ruleTypeButtonTextActive
                ]}>
                  − Block Time (Off)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Scope */}
          <View style={styles.field}>
            <Text style={styles.label}>Apply To</Text>
            <View style={styles.scopeButtons}>
              <TouchableOpacity
                style={[
                  styles.scopeButton,
                  scopeType === 'family' && styles.scopeButtonActive
                ]}
                onPress={() => {
                  setScopeType('family');
                  setSelectedChildId(null);
                }}
              >
                <Text style={[
                  styles.scopeButtonText,
                  scopeType === 'family' && styles.scopeButtonTextActive
                ]}>
                  Entire Family
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.scopeButton,
                  scopeType === 'child' && styles.scopeButtonActive
                ]}
                onPress={() => setScopeType('child')}
              >
                <Text style={[
                  styles.scopeButtonText,
                  scopeType === 'child' && styles.scopeButtonTextActive
                ]}>
                  Specific Child
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Child Selection */}
          {scopeType === 'child' && (
            <View style={styles.field}>
              <Text style={styles.label}>Child</Text>
              <View style={styles.childButtons}>
                {children.map(child => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childButton,
                      selectedChildId === child.id && styles.childButtonActive
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text style={[
                      styles.childButtonText,
                      selectedChildId === child.id && styles.childButtonTextActive
                    ]}>
                      {child.name || child.first_name || 'Unnamed'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Days */}
          <View style={styles.field}>
            <Text style={styles.label}>Days of Week</Text>
            <View style={styles.dayButtons}>
              {Object.entries(dayLabels).map(([code, label]) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.dayButton,
                    days.includes(code) && styles.dayButtonActive
                  ]}
                  onPress={() => toggleDay(code)}
                >
                  <Text style={[
                    styles.dayButtonText,
                    days.includes(code) && styles.dayButtonTextActive
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time */}
          <View style={styles.field}>
            <Text style={styles.label}>Time Range</Text>
            <View style={styles.timeInputs}>
              <View style={styles.timeInput}>
                <Text style={styles.timeLabel}>Start</Text>
                <View style={styles.timePicker}>
                  <Text
                    style={styles.timePickerText}
                    placeholder="09:00"
                    placeholderTextColor={colors.muted}
                    value={startTime}
                    onChangeText={setStartTime}
                  />
                </View>
              </View>
              <View style={styles.timeInput}>
                <Text style={styles.timeLabel}>End</Text>
                <View style={styles.timePicker}>
                  <Text
                    style={styles.timePickerText}
                    placeholder="15:00"
                    placeholderTextColor={colors.muted}
                    value={endTime}
                    onChangeText={setEndTime}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Explanation */}
          <View style={styles.explanation}>
            <AlertTriangle size={16} color={colors.orangeBold} />
            <Text style={styles.explanationText}>
              {ruleKind === 'teach' 
                ? 'This rule will add teaching time to the schedule. Other rules can still block parts of this time.'
                : 'This rule will block time from the schedule. It will override any teaching time in this period.'
              }
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={onSaveRule}
            disabled={saving}
          >
            <Save size={16} color={colors.accentContrast} />
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Rule'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  closeButton: {
    padding: 8,
    borderRadius: 6,
  },
  form: {
    padding: 20,
    maxHeight: 400,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.panel,
    borderRadius: colors.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputText: {
    fontSize: 16,
    color: colors.text,
  },
  ruleTypeButtons: {
    flexDirection: 'row',
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  ruleTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.panel,
  },
  ruleTypeButtonActive: {
    backgroundColor: colors.accent,
  },
  ruleTypeButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  ruleTypeButtonTextActive: {
    color: colors.accentContrast,
  },
  scopeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.panel,
  },
  scopeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scopeButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  scopeButtonTextActive: {
    color: colors.accentContrast,
  },
  childButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  childButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  childButtonTextActive: {
    color: colors.accentContrast,
  },
  dayButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  dayButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  dayButtonTextActive: {
    color: colors.accentContrast,
  },
  timeInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInput: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  timePicker: {
    backgroundColor: colors.panel,
    borderRadius: colors.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timePickerText: {
    fontSize: 16,
    color: colors.text,
  },
  explanation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.orangeSoft,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.orangeBold,
  },
  explanationText: {
    flex: 1,
    fontSize: 13,
    color: colors.orangeBold,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    color: colors.accentContrast,
    fontWeight: '500',
  },
});

export default AddRuleForm;
