/**
 * Read-only modal: learner reviews what they asked (reason + note + time per message).
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildHelpMessageHistory, formatHelpMessageAt } from '../../lib/assignmentHelpHistory';

export default function StudentHelpHistoryModal({ visible, onClose, assignment, contextTitle }) {
  const items = useMemo(() => getChildHelpMessageHistory(assignment), [assignment]);

  const title = contextTitle || assignment?.title || 'Schoolwork';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>What you sent</Text>
              <Text style={styles.contextLine} numberOfLines={2}>
                {title}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <Text style={styles.empty}>
              No messages found yet. When you use &quot;Ask for help&quot;, they&apos;ll show up here.
            </Text>
          ) : (
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {items.map((row, idx) => {
                const when = formatHelpMessageAt(row.at);
                return (
                  <View
                    key={row.id || String(idx)}
                    style={[styles.card, idx < items.length - 1 && styles.cardSpacing]}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.reasonPill}>
                        <Text style={styles.reasonPillText} numberOfLines={2}>
                          {row.reason}
                        </Text>
                      </View>
                      {when ? (
                        <Text style={styles.timeText}>{when}</Text>
                      ) : (
                        <Text style={styles.timeMuted}>—</Text>
                      )}
                    </View>
                    {row.note ? (
                      <Text style={styles.noteText}>{row.note}</Text>
                    ) : (
                      <Text style={styles.noteMuted}>No extra note</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  contextLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  empty: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scroll: {
    maxHeight: 360,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  cardSpacing: {
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  reasonPill: {
    flex: 1,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#89B5E4',
  },
  reasonPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#89B5E4',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 0,
    maxWidth: '42%',
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeMuted: {
    fontSize: 11,
    color: colors.muted,
  },
  noteText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  noteMuted: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.muted,
  },
  closeBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#85C4F2',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133, 196, 242, 0.35)',
      cursor: 'pointer',
    }),
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
