import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CHAT_COMMIT_KINDS } from '../../lib/assistant/chatCommit';

const COMMIT_PRIMARY_LABELS = {
  [CHAT_COMMIT_KINDS.CREATE_EVENT]: 'Add to calendar',
  [CHAT_COMMIT_KINDS.ADD_ACTIVITY]: 'Log activity',
  [CHAT_COMMIT_KINDS.QUEUE_RESCHEDULE]: 'Queue reschedule',
  [CHAT_COMMIT_KINDS.DELETE_EVENT]: 'Delete event',
  [CHAT_COMMIT_KINDS.UPDATE_EVENT]: 'Apply changes',
  [CHAT_COMMIT_KINDS.MARK_ATTENDANCE]: 'Mark attendance',
  [CHAT_COMMIT_KINDS.LOG_GRADE]: 'Log grade',
  [CHAT_COMMIT_KINDS.DELETE_MATERIAL]: 'Remove from library',
  [CHAT_COMMIT_KINDS.UPDATE_MATERIAL]: 'Rename',
  [CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK]: 'Add to library',
  [CHAT_COMMIT_KINDS.UPDATE_CHILD]: 'Save changes',
  [CHAT_COMMIT_KINDS.ARCHIVE_CHILD]: 'Archive child',
  [CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT]: 'Delete permanently',
  [CHAT_COMMIT_KINDS.ADD_SUBJECT]: 'Add subject',
  [CHAT_COMMIT_KINDS.DELETE_SUBJECT]: 'Delete subject',
  [CHAT_COMMIT_KINDS.UPDATE_SUBJECT]: 'Rename subject',
};

/**
 * Review step for chatbot-proposed writes. Extend with new kinds alongside CHAT_COMMIT_KINDS.
 */
export default function DoodlePendingCommitBar({ pendingCommit, disabled, onConfirm, onCancel }) {
  if (!pendingCommit || pendingCommit.resolved) return null;

  const primaryLabel =
    pendingCommit.kind === CHAT_COMMIT_KINDS.UPDATE_EVENT &&
    pendingCommit?.payload?.allowOverlaps === true
      ? 'Apply anyway'
      : COMMIT_PRIMARY_LABELS[pendingCommit.kind] ?? null;

  if (primaryLabel) {
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.primary, disabled && styles.disabled]}
          onPress={onConfirm}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
        >
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.secondary, disabled && styles.disabled]}
          onPress={onCancel}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#2563eb',
  },
  secondary: {
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
});
