import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { designTokens } from '../../theme/designTokens';

const { colors: tok } = designTokens;
const WEB_DIALOG_Z_INDEX = 2147483647;

function ModalBody({
  title,
  message,
  loading = false,
  working = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showConfirm = true,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  return (
    <View style={styles.cardInner}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={3}>
          {title}
        </Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onCancel}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Close"
          disabled={working}
        >
          <Text style={styles.closeButtonIcon}>×</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.message}>{message || 'Loading…'}</Text>
        </View>
      ) : (
        <Text style={styles.message}>{message}</Text>
      )}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          activeOpacity={0.85}
          disabled={working}
        >
          <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
        </TouchableOpacity>
        {showConfirm ? (
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (confirmDisabled || working || loading) && styles.confirmButtonDisabled,
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
            disabled={confirmDisabled || working || loading}
          >
            {working ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
            <Text style={styles.confirmButtonText}>
              {working ? 'Working…' : confirmLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function ClassworkPlanningModal({
  visible,
  title = '',
  message = '',
  loading = false,
  working = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showConfirm = true,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  if (!visible) return null;

  const content = (
    <TouchableOpacity
      style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}
      activeOpacity={1}
      onPress={working ? undefined : onCancel}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPress={(e) => e?.stopPropagation?.()}
      >
        <ModalBody
          title={title}
          message={message}
          loading={loading}
          working={working}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          showConfirm={showConfirm}
          confirmDisabled={confirmDisabled}
          onConfirm={onConfirm}
          onCancel={onCancel}
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
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
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
    maxWidth: 460,
    backgroundColor: tok.paper,
    borderRadius: 28,
    padding: 32,
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
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: tok.ink,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  closeButtonIcon: {
    fontSize: 22,
    lineHeight: 24,
    color: '#64748B',
    marginTop: -2,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: tok.muted,
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-line',
    }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 9999,
    backgroundColor: '#2563EB',
  },
  confirmButtonDisabled: {
    opacity: 0.55,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
