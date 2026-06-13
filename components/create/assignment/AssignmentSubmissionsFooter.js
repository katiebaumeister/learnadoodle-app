import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Award, Check, RotateCcw } from 'lucide-react';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from '../../ui/modalButtonStyles';

export default function AssignmentSubmissionsFooter({
  onReturnForChanges,
  onMarkComplete,
  onGrade,
  submitting = false,
  showGrade = true,
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onReturnForChanges}
        disabled={submitting}
        style={[styles.actionButton, styles.sendBackButton, submitting && styles.buttonDisabled]}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Return for changes"
        {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
      >
        <RotateCcw size={15} color="#B45309" />
        <Text style={styles.sendBackText}>Return for changes</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onMarkComplete}
        disabled={submitting}
        style={[styles.actionButton, styles.approveButton, submitting && styles.buttonDisabled]}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Mark complete"
        {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
      >
        <Check size={15} color="#15803D" />
        <Text style={styles.approveText}>Mark complete</Text>
      </TouchableOpacity>

      {showGrade ? (
        <TouchableOpacity
          onPress={onGrade}
          disabled={submitting}
          style={[
            styles.actionButton,
            modalButtonStyles.secondaryButtonCompact,
            submitting && modalButtonStyles.buttonDisabled,
          ]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Grade"
          {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
        >
          <Award size={15} color={MODAL_ACCENT_TEXT} />
          <Text style={modalButtonStyles.secondaryButtonCompactText}>Grade</Text>
        </TouchableOpacity>
      ) : null}
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
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
  },
  sendBackButton: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  sendBackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  approveButton: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  approveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  buttonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
});
