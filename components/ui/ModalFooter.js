import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Sparkles, Trash2, X } from 'lucide-react';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from './modalButtonStyles';

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
  compact = false,
}) {
  const isPrimaryBlocked = Boolean(disabled || visuallyDisabled);
  const showDelete = mode === 'edit' && !!destructiveLabel;
  const rowStyle = compact ? styles.rowCompact : styles.row;
  const cancelStyle = compact ? styles.cancelButtonCompact : styles.cancelButton;
  const primaryStyle = compact ? styles.primaryCompact : styles.primary;
  const primaryTextStyle = compact ? styles.primaryTextCompact : styles.primaryText;
  const cancelTextStyle = compact ? styles.cancelButtonTextCompact : styles.cancelButtonText;

  if (compact) {
    return (
      <View style={rowStyle}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={loading}
          style={[cancelStyle, loading && styles.buttonDisabled]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          <Text style={cancelTextStyle}>Cancel</Text>
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
            primaryStyle,
            { backgroundColor: loading ? '#B7BFCD' : accent },
          ]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          {mode === 'edit' ? (
            <Check size={14} color="#FFF" />
          ) : (
            <Sparkles size={14} color="#FFF" />
          )}
          <Text style={primaryTextStyle}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={rowStyle}>
      <TouchableOpacity
        onPress={onCancel}
        disabled={loading}
        style={[cancelStyle, styles.cancelButtonWithIcon, loading && styles.buttonDisabled]}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
      >
        <X size={16} color="#374151" />
        <Text style={[cancelTextStyle, loading && styles.buttonTextDisabled]}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.actionGroup}>
        {showDelete ? (
          <TouchableOpacity
            onPress={onDelete}
            disabled={loading}
            style={[modalButtonStyles.secondaryButton, loading && modalButtonStyles.buttonDisabled]}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={destructiveLabel}
            {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
          >
            <Trash2 size={16} color={MODAL_ACCENT_TEXT} />
            <Text style={modalButtonStyles.secondaryButtonText}>{destructiveLabel}</Text>
          </TouchableOpacity>
        ) : null}
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
            primaryStyle,
            { backgroundColor: loading ? '#B7BFCD' : accent },
            loading && styles.buttonDisabled,
          ]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          {mode === 'edit' ? (
            <Check size={16} color="#FFF" />
          ) : (
            <Sparkles size={16} color="#FFF" />
          )}
          <Text style={primaryTextStyle}>{primaryLabel}</Text>
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
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelButtonWithIcon: {
    paddingHorizontal: 18,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonTextDisabled: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
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
  rowCompact: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButtonCompact: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelButtonTextCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryCompact: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryTextCompact: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
