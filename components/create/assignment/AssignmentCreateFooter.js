import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Sparkles, X } from 'lucide-react';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from '../../ui/modalButtonStyles';

export default function AssignmentCreateFooter({
  onCancel,
  onAssign,
  onCreateClasswork = null,
  saving = false,
  assignDisabled = false,
  createClassworkDisabled = false,
  onBlockedAction,
  onBlockedCreateClasswork,
}) {
  const handlePress = (disabled, action, blocked) => {
    if (saving) return;
    if (disabled) {
      blocked?.();
      return;
    }
    action?.();
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onCancel}
        disabled={saving}
        style={[styles.cancelButton, saving && styles.buttonDisabled]}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
      >
        <X size={16} color="#374151" />
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.actionGroup}>
        {typeof onCreateClasswork === 'function' ? (
          <TouchableOpacity
            onPress={() => handlePress(createClassworkDisabled, onCreateClasswork, onBlockedCreateClasswork)}
            disabled={saving}
            style={[modalButtonStyles.secondaryButton, saving && modalButtonStyles.buttonDisabled]}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Create classwork"
            {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
          >
            <Sparkles size={16} color={MODAL_ACCENT_TEXT} strokeWidth={2.25} />
            <Text style={modalButtonStyles.secondaryButtonText}>Create classwork</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => handlePress(assignDisabled, onAssign, onBlockedAction)}
          disabled={saving}
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Assign"
          {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
        >
          <Check size={16} color="#FFF" />
          <Text style={styles.primaryButtonText}>Assign</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  cancelButtonText: {
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
