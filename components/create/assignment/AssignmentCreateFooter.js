import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check } from 'lucide-react';

export default function AssignmentCreateFooter({
  onSchedule,
  onSaveDraft,
  onAssign,
  saving = false,
  assignDisabled = false,
  scheduleDisabled = false,
  draftDisabled = false,
  onBlockedAction,
}) {
  const handlePress = (disabled, action) => {
    if (saving) return;
    if (disabled) {
      onBlockedAction?.();
      return;
    }
    action?.();
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => handlePress(scheduleDisabled, onSchedule)}
        disabled={saving}
        style={[styles.secondaryButton, saving && styles.buttonDisabled]}
        activeOpacity={0.9}
        {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
      >
        <Text style={styles.secondaryButtonText}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handlePress(draftDisabled, onSaveDraft)}
        disabled={saving}
        style={[styles.secondaryButton, saving && styles.buttonDisabled]}
        activeOpacity={0.9}
        {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
      >
        <Text style={styles.secondaryButtonText}>{saving ? 'Saving…' : 'Save draft'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handlePress(assignDisabled, onAssign)}
        disabled={saving}
        style={[styles.primaryButton, saving && styles.buttonDisabled]}
        activeOpacity={0.9}
        {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
      >
        <Check size={16} color="#FFF" />
        <Text style={styles.primaryButtonText}>Assign</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  primaryButton: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#9ECFFB',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
});
