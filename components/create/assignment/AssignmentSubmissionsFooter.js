import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from '../../ui/modalButtonStyles';

export default function AssignmentSubmissionsFooter({
  onCancel,
  onReturnForChanges,
  onMarkComplete,
  onSaveSubmission,
  submitting = false,
  showReturnForChanges = false,
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onCancel}
        disabled={submitting}
        style={[styles.cancelButton, submitting && styles.buttonDisabled]}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
      >
        <X size={16} color="#374151" />
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.actionGroup}>
        {showReturnForChanges ? (
          <TouchableOpacity
            onPress={onReturnForChanges}
            disabled={submitting}
            style={[styles.actionButton, styles.sendBackButton, submitting && styles.buttonDisabled]}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Return for changes"
            {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
          >
            <RotateCcw size={16} color="#B45309" />
            <Text style={styles.sendBackText}>Return for changes</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={onMarkComplete}
          disabled={submitting}
          style={[styles.actionButton, styles.approveButton, submitting && styles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Mark complete"
          {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
        >
          <Check size={16} color="#15803D" />
          <Text style={styles.approveText}>Mark complete</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSaveSubmission}
          disabled={submitting}
          style={[
            styles.actionButton,
            modalButtonStyles.secondaryButton,
            submitting && modalButtonStyles.buttonDisabled,
          ]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Save submission"
          {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
        >
          <Save size={16} color={MODAL_ACCENT_TEXT} />
          <Text style={modalButtonStyles.secondaryButtonText}>Save submission</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  sendBackButton: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  sendBackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B45309',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  approveButton: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  approveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
});
