import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Sparkles, Trash2 } from 'lucide-react';

export function ModalFooter({
  mode = 'add',
  primaryLabel,
  onCancel,
  onPrimary,
  onDelete,
  accent = '#7C70F4',
  destructiveLabel,
  disabled,
  visuallyDisabled = false,
  loading = false,
  onBlockedPrimary,
}) {
  const isPrimaryBlocked = Boolean(disabled || visuallyDisabled);
  const showDelete = mode === 'edit' && !!destructiveLabel;
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showDelete && (
          <TouchableOpacity
            onPress={onDelete}
            disabled={loading}
            style={[
              styles.cancelButton,
              styles.cancelButtonWithIcon,
              loading && styles.cancelButtonDisabled,
            ]}
            activeOpacity={0.9}
            {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
          >
            <Trash2 size={17} color="#374151" />
            <Text style={[styles.cancelButtonText, loading && styles.cancelButtonTextDisabled]}>
              {destructiveLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.right}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={loading}
          style={[styles.cancelButton, loading && styles.cancelButtonDisabled]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (loading) return;
            if (isPrimaryBlocked) {
              onBlockedPrimary?.();
              return;
            }
            onPrimary?.();
          }}
          disabled={loading}
          style={[
            styles.primary,
            { backgroundColor: loading ? '#B7BFCD' : accent },
          ]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          {mode === 'edit' ? (
            <Check size={16} color="#FFF" />
          ) : (
            <Sparkles size={16} color="#FFF" />
          )}
          <Text style={styles.primaryText}>{primaryLabel}</Text>
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
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelButtonWithIcon: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  cancelButtonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  cancelButtonTextDisabled: {
    opacity: 0.8,
  },
  primary: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
});
