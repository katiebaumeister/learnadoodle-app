import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { Trash2 } from 'lucide-react';
import { designTokens } from '../theme/designTokens';
import { destructiveButtonStyles, destructiveIconColor } from './ui/destructiveButtonStyles';

const { colors: tok, fonts, radius } = designTokens;
const primary = tok.primary;
const paper = tok.paper;
const ink = tok.ink;
const muted = tok.muted;

/** Align with Invite-a-child and other large modals: League Spartan title, soft card. */
const FONT_MODAL_TITLE = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_MODAL_BUTTON = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MODAL_RADIUS = 28;
const MODAL_PAD = 32;
/** designTokens.radius (12) — used for action pills; keep name `radius` for any HMR paths expecting it */

// On web, render above other modals (e.g. Edit Subject). Use portal + high z-index so dialog is never behind a parent modal.
const WEB_DIALOG_Z_INDEX = 2147483647;

function DialogContent({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }) {
  return (
    <View style={styles.cardInner}>
      <View style={styles.headerRow}>
        {title ? (
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
        ) : (
          <View style={styles.titleSpacer} />
        )}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onCancel}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeButtonIcon}>×</Text>
        </TouchableOpacity>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.85}>
          <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            destructive && destructiveButtonStyles.buttonCompact,
            destructive && styles.confirmButtonDestructive,
          ]}
          onPress={onConfirm}
          activeOpacity={0.85}
        >
          {destructive ? <Trash2 size={14} color={destructiveIconColor} strokeWidth={2.25} /> : null}
          <Text style={[
            styles.confirmButtonText,
            destructive && destructiveButtonStyles.buttonTextCompact,
            destructive && styles.confirmButtonTextDestructive,
          ]}>
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Learnadoodle-styled confirmation dialog.
 * Replaces native confirm() with a modal that matches app branding.
 * On web, renders via portal to document.body with max z-index so it always appears above other modals.
 */
export default function ConfirmDialog({
  visible,
  title = 'Confirm',
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}) {
  const handleConfirm = () => onConfirm?.();
  const handleCancel = () => onCancel?.();

  if (!visible) return null;

  const content = (
    <TouchableOpacity
      style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}
      activeOpacity={1}
      onPress={handleCancel}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPress={(e) => e?.stopPropagation?.()}
      >
        <DialogContent
          title={title}
          message={message}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          destructive={destructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM.createPortal) {
        return ReactDOM.createPortal(content, document.body);
      }
    } catch (_) {}
  }

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={handleCancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000000,
    }),
  },
  overlayWebPortal: {
    zIndex: WEB_DIALOG_Z_INDEX,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: paper,
    borderRadius: MODAL_RADIUS,
    padding: MODAL_PAD,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.18)',
    }),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 16,
  },
  cardInner: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  titleSpacer: {
    flex: 1,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: ink,
    fontFamily: FONT_MODAL_TITLE,
    paddingRight: 8,
    lineHeight: 28,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: paper,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: -4,
  },
  closeButtonIcon: {
    fontSize: 22,
    lineHeight: 24,
    color: '#6b7280',
    fontWeight: '400',
    marginTop: -2,
  },
  message: {
    fontSize: 15,
    color: muted,
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: fonts.sans,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius,
    backgroundColor: '#f3f4f6',
    minWidth: 96,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    fontFamily: Platform.OS === 'web' ? FONT_MODAL_BUTTON : fonts.sans,
  },
  confirmButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius,
    backgroundColor: primary,
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmButtonDestructive: {
    backgroundColor: destructiveButtonStyles.buttonCompact.backgroundColor,
    minWidth: 96,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'web' ? FONT_MODAL_BUTTON : fonts.sans,
  },
  confirmButtonTextDestructive: {
    color: destructiveButtonStyles.buttonTextCompact.color,
  },
});
