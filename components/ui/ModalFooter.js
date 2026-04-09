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
  loading = false,
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={onCancel} disabled={loading}>
        <Text style={styles.cancel}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.right}>
        {mode === 'edit' && !!destructiveLabel && (
          <TouchableOpacity onPress={onDelete} disabled={loading}>
            <Text style={styles.delete}>{destructiveLabel}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onPrimary}
          disabled={disabled || loading}
          style={[
            styles.primary,
            { backgroundColor: disabled || loading ? '#B7BFCD' : accent },
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
    justifyContent: 'space-between',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cancel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4A556B',
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

