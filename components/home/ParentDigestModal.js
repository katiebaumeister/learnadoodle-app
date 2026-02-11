import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { X } from 'lucide-react';

export default function ParentDigestModal({
  visible,
  onClose,
  todayBlocks,
  overdueCount,
  mostActiveSubject,
  suggestedAction,
}) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Parent Digest</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Today scheduled blocks</Text>
              <Text style={styles.statValue}>{todayBlocks}</Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Overdue count</Text>
              <Text style={styles.statValue}>{overdueCount}</Text>
            </View>

            {mostActiveSubject && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Most active subject this week</Text>
                <Text style={styles.statValue}>{mostActiveSubject}</Text>
              </View>
            )}

            {suggestedAction && (
              <View style={styles.suggestedSection}>
                <Text style={styles.suggestedLabel}>Suggested next action</Text>
                <Text style={styles.suggestedText}>{suggestedAction}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.closeButtonBottom}
            onPress={onClose}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.closeButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  body: {
    gap: 20,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedSection: {
    paddingTop: 16,
  },
  suggestedLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedText: {
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButtonBottom: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
