import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Trash2 } from 'lucide-react';
import { MODAL_VISUAL } from './modalSystem';

/**
 * Sticky modal footer — always Cancel on the right cluster with primary action.
 * Optional Save Draft between Cancel and primary for long forms.
 */
export function ModalFooter({
  mode = 'add',
  primaryLabel,
  draftLabel = null,
  onCancel,
  onDraft = null,
  onPrimary,
  onDelete,
  accent = MODAL_VISUAL.primaryBlue,
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
        {showDelete ? (
          <TouchableOpacity
            onPress={onDelete}
            disabled={loading}
            style={[styles.ghostButton, styles.ghostButtonWithIcon, loading && styles.buttonDisabled]}
            activeOpacity={0.9}
            {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
          >
            <Trash2 size={16} color="#DC2626" />
            <Text style={[styles.destructiveText, loading && styles.buttonTextDisabled]}>
              {destructiveLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.right}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={loading}
          style={[styles.cancelButton, loading && styles.buttonDisabled]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        {draftLabel && onDraft ? (
          <TouchableOpacity
            onPress={onDraft}
            disabled={loading}
            style={[styles.draftButton, loading && styles.buttonDisabled]}
            activeOpacity={0.9}
            {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
          >
            <Text style={styles.draftButtonText}>{draftLabel}</Text>
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
            styles.primary,
            { backgroundColor: loading ? '#94A3B8' : accent },
          ]}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
        >
          {mode === 'edit' ? <Check size={16} color="#FFF" /> : null}
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    flexShrink: 0,
  },
  cancelButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: MODAL_VISUAL.cancelBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: MODAL_VISUAL.cancelText,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  draftButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: MODAL_VISUAL.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ghostButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonWithIcon: {
    flexDirection: 'row',
    gap: 6,
  },
  destructiveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  buttonDisabled: {
    opacity: 0.6,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  buttonTextDisabled: {
    opacity: 0.8,
  },
});
