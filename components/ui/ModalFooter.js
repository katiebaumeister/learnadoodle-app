import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Sparkles } from 'lucide-react';

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
  return (
    <View style={styles.row}>
      <View style={styles.right}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={loading}
          style={[styles.cancelButton, loading && styles.cancelButtonDisabled]}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        {mode === 'edit' && !!destructiveLabel && (
          <TouchableOpacity onPress={onDelete} disabled={loading}>
            <Text style={styles.delete}>{destructiveLabel}</Text>
          </TouchableOpacity>
        )}

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
            { backgroundColor: isPrimaryBlocked || loading ? '#B7BFCD' : accent },
          ]}
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
    justifyContent: 'flex-end',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 28,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
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
  delete: {
    fontSize: 16,
    fontWeight: '700',
    color: '#69758A',
  },
  primary: {
    minHeight: 50,
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
  },
});

