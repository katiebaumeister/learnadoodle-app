import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import { createModalStyles as sharedStyles } from '../create/shared/createModalStyles';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';

const PLANNING_MODAL_MAX_WIDTH = 480;
const WEB_DIALOG_Z_INDEX = 2147483647;

function ScheduleLinesList({ lines = [], heading = 'Learning days' }) {
  if (!lines.length) return null;
  return (
    <View style={styles.scheduleSection}>
      <Text style={styles.scheduleHeading}>{heading}</Text>
      {lines.map((line, index) => (
        <Text key={`schedule-line-${index}`} style={styles.scheduleLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function ModalContent({
  title,
  message,
  scheduleLines = [],
  scheduleLinesHeading = 'Learning days',
  loading = false,
  working = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showConfirm = true,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const hasScrollableBody = scheduleLines.length > 0;

  const footer = showConfirm ? (
    <ModalFooter
      mode={confirmLabel === 'Done' ? 'edit' : 'add'}
      primaryLabel={working ? 'Working…' : confirmLabel}
      onCancel={onCancel}
      onPrimary={onConfirm}
      accent={LEARNADOODLE_LIGHT_BLUE}
      disabled={working || loading}
      visuallyDisabled={confirmDisabled || loading}
      loading={working || loading}
    />
  ) : (
    <View style={styles.singleActionRow}>
      <TouchableOpacity
        style={styles.closeOnlyButton}
        onPress={onCancel}
        activeOpacity={0.9}
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        {...(Platform.OS === 'web' && { cursor: working ? 'not-allowed' : 'pointer' })}
      >
        <Text style={styles.closeOnlyButtonText}>{cancelLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  const bodyContent = loading ? (
    <View style={styles.loadingRow}>
      <ActivityIndicator size="small" color={LEARNADOODLE_LIGHT_BLUE} />
      <Text style={styles.message}>{message || 'Loading…'}</Text>
    </View>
  ) : (
    <>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <ScheduleLinesList lines={scheduleLines} heading={scheduleLinesHeading} />
    </>
  );

  return (
    <AppModalShell
      title={title}
      onClose={working ? undefined : onCancel}
      shellStyle={[sharedStyles.compactShell, styles.planningShell]}
      titleRowStyle={sharedStyles.compactTitleRow}
      contentContainerStyle={sharedStyles.contentContainer}
      bodyStyle={sharedStyles.shellBody}
      disableShellScroll={!hasScrollableBody}
      maxWidth={PLANNING_MODAL_MAX_WIDTH}
      footer={footer}
    >
      {hasScrollableBody ? (
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyScrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {bodyContent}
        </ScrollView>
      ) : (
        bodyContent
      )}
    </AppModalShell>
  );
}

export default function ClassworkPlanningModal({
  visible,
  title = '',
  message = '',
  scheduleLines = [],
  scheduleLinesHeading = 'Learning days',
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
    <View style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}>
      <Pressable
        style={styles.backdrop}
        onPress={working ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        {...(Platform.OS === 'web' && { cursor: 'default' })}
      />
      <View style={styles.modalWrap}>
        <ModalContent
          title={title}
          message={message}
          scheduleLines={scheduleLines}
          scheduleLinesHeading={scheduleLinesHeading}
          loading={loading}
          working={working}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          showConfirm={showConfirm}
          confirmDisabled={confirmDisabled}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </View>
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
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 1000000,
    }),
  },
  overlayWebPortal: {
    zIndex: WEB_DIALOG_Z_INDEX,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  modalWrap: {
    width: '100%',
    maxWidth: PLANNING_MODAL_MAX_WIDTH,
    zIndex: 1,
  },
  planningShell: {
    maxWidth: PLANNING_MODAL_MAX_WIDTH,
    minHeight: 0,
    height: 'auto',
    ...(Platform.OS === 'web' && {
      maxHeight: '88vh',
    }),
  },
  bodyScroll: {
    maxHeight: Platform.OS === 'web' ? 320 : 280,
  },
  bodyScrollContent: {
    paddingBottom: 4,
    gap: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-line',
    }),
  },
  scheduleSection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  scheduleHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scheduleLine: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  singleActionRow: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  closeOnlyButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  closeOnlyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
});
