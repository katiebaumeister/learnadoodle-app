import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { designTokens } from '../theme/designTokens';

const { colors: tok, radius, fonts } = designTokens;
const primary = tok.primary;
const paper = tok.paper;
const ink = tok.ink;
const muted = tok.muted;

// On web, render above other modals (e.g. Edit Subject). Use portal + high z-index so dialog is never behind a parent modal.
const WEB_DIALOG_Z_INDEX = 2147483647;

function DialogContent({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }) {
  return (
    <>
      <View style={styles.modal}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmButton, destructive && styles.confirmButtonDestructive]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <Text style={[styles.confirmButtonText, destructive && styles.confirmButtonTextDestructive]}>
              {confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
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
    <View style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}>
      <DialogContent
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: paper,
    borderRadius: radius,
    padding: 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: ink,
    marginBottom: 8,
    fontFamily: fonts.sans,
  },
  message: {
    fontSize: 15,
    color: muted,
    lineHeight: 22,
    marginBottom: 24,
    fontFamily: fonts.sans,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: primary,
    fontFamily: fonts.sans,
  },
  confirmButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: primary,
  },
  confirmButtonDestructive: {
    backgroundColor: '#dc2626',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: fonts.sans,
  },
  confirmButtonTextDestructive: {
    color: '#FFFFFF',
  },
});
