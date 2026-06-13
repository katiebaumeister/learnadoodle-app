import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Trash2, Users, X } from 'lucide-react';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from '../../ui/modalButtonStyles';

export default function AssignmentEditFooter({
  onCancel,
  onDelete,
  onViewSubmissions,
  onSave,
  saving = false,
  saveDisabled = false,
  onBlockedSave,
  deleting = false,
}) {
  const handleSave = () => {
    if (saving || deleting) return;
    if (saveDisabled) {
      onBlockedSave?.();
      return;
    }
    onSave?.();
  };

  return (
    <View style={styles.row}>
      <View style={styles.leftGroup}>
        <TouchableOpacity
          onPress={onDelete}
          disabled={saving || deleting}
          style={[styles.deleteButton, (saving || deleting) && styles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Delete assignment"
          {...(Platform.OS === 'web' && { cursor: saving || deleting ? 'not-allowed' : 'pointer' })}
        >
          <Trash2 size={16} color="#DC2626" />
          <Text style={styles.deleteButtonText}>Delete assignment</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onCancel}
          disabled={saving || deleting}
          style={[styles.cancelButton, (saving || deleting) && styles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          {...(Platform.OS === 'web' && { cursor: saving || deleting ? 'not-allowed' : 'pointer' })}
        >
          <X size={16} color="#374151" />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionGroup}>
        <TouchableOpacity
          onPress={onViewSubmissions}
          disabled={saving || deleting}
          style={[modalButtonStyles.secondaryButton, (saving || deleting) && modalButtonStyles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="View submissions"
          {...(Platform.OS === 'web' && { cursor: saving || deleting ? 'not-allowed' : 'pointer' })}
        >
          <Users size={16} color={MODAL_ACCENT_TEXT} />
          <Text style={modalButtonStyles.secondaryButtonText}>View submissions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || deleting}
          style={[styles.primaryButton, (saving || deleting || saveDisabled) && styles.buttonDisabled]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          {...(Platform.OS === 'web' && { cursor: saving || deleting ? 'not-allowed' : 'pointer' })}
        >
          <Check size={16} color="#FFF" />
          <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
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
    flexWrap: 'wrap',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  deleteButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
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
