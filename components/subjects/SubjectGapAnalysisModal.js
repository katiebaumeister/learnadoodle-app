import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { designTokens } from '../../theme/designTokens';
import { formatFixGapHistoryTimestamp } from '../../lib/subjectFixGapHistory';

const { colors: tok } = designTokens;
const WEB_DIALOG_Z_INDEX = 2147483647;

function HistorySection({ historyRuns = [], canUndo = false, undoing = false, onUndo }) {
  if (!historyRuns.length) return null;
  return (
    <View style={styles.historySection}>
      <Text style={styles.historyHeading}>
        {`Gap history (${historyRuns.length} action${historyRuns.length === 1 ? '' : 's'})`}
      </Text>
      <ScrollView
        style={styles.historyScroll}
        contentContainerStyle={styles.historyScrollContent}
        nestedScrollEnabled
      >
        {historyRuns.map((run) => (
          <View key={run.key} style={styles.historyRun}>
            <Text style={styles.historyLine}>
              {`${formatFixGapHistoryTimestamp(run.createdAt)}${run.isUndone ? ' (undone)' : ''}:`}
            </Text>
            {run.slotLines.length > 0 ? (
              run.slotLines.map((line, idx) => (
                <Text key={`${run.key}-${idx}`} style={styles.historyLine}>
                  {`${line.verb} ${line.line}`}
                </Text>
              ))
            ) : (
              <Text style={styles.historyLine}>
                {run.message || (
                  run.removedCount > 0
                    ? `Removed ${run.removedCount} event${run.removedCount === 1 ? '' : 's'}.`
                    : `Added ${run.createdCount} event${run.createdCount === 1 ? '' : 's'}.`
                )}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
      {canUndo ? (
        <TouchableOpacity
          style={[styles.undoButton, undoing && styles.undoButtonDisabled]}
          onPress={onUndo}
          disabled={undoing}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' && { cursor: undoing ? 'not-allowed' : 'pointer' })}
        >
          <Text style={styles.undoButtonText}>
            {undoing ? 'Undoing…' : 'Undo last action'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function SubjectGapAnalysisModal({
  visible,
  title = '',
  message = '',
  slotLines = [],
  historyRuns = [],
  loading = false,
  working = false,
  undoing = false,
  canUndo = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Close',
  showConfirm = true,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  onUndo,
}) {
  if (!visible) return null;

  const content = (
    <TouchableOpacity
      style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}
      activeOpacity={1}
      onPress={working || undoing ? undefined : onCancel}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPress={(e) => e?.stopPropagation?.()}
      >
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
              disabled={working || undoing}
            >
              <Text style={styles.closeButtonIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.message}>{message || 'Loading…'}</Text>
              </View>
            ) : (
              <>
                {message ? <Text style={styles.message}>{message}</Text> : null}
                {slotLines.length > 0 ? (
                  <View style={styles.slotSection}>
                    <Text style={styles.slotHeading}>Sessions to add</Text>
                    {slotLines.map((line, idx) => (
                      <Text key={`slot-${idx}`} style={styles.slotLine}>{line}</Text>
                    ))}
                  </View>
                ) : null}
                <HistorySection
                  historyRuns={historyRuns}
                  canUndo={canUndo}
                  undoing={undoing}
                  onUndo={onUndo}
                />
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.85}
              disabled={working || undoing}
            >
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </TouchableOpacity>
            {showConfirm ? (
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (confirmDisabled || working || loading || undoing) && styles.confirmButtonDisabled,
                ]}
                onPress={onConfirm}
                activeOpacity={0.85}
                disabled={confirmDisabled || working || loading || undoing}
              >
                {working ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={styles.confirmButtonText}>
                  {working ? 'Working…' : confirmLabel}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
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
    maxWidth: 520,
    maxHeight: '88vh',
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
    maxHeight: Platform.OS === 'web' ? 'calc(88vh - 64px)' : undefined,
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
  bodyScroll: {
    maxHeight: Platform.OS === 'web' ? 360 : 320,
  },
  bodyScrollContent: {
    paddingBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: tok.muted,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-line',
    }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  slotSection: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slotHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  slotLine: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    marginBottom: 4,
  },
  historySection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  historyHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  historyScroll: {
    maxHeight: 160,
  },
  historyScrollContent: {
    paddingBottom: 4,
  },
  historyRun: {
    marginBottom: 10,
  },
  historyLine: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  undoButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  undoButtonDisabled: {
    opacity: 0.6,
  },
  undoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
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
