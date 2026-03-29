import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { X, ChevronRight } from 'lucide-react';

/**
 * Same shell as SubjectPastEventsAttendanceModal: overlay, card, header, scroll list, cancel footer.
 */
export default function SubjectAssignedToStudentModal({
  visible,
  onClose,
  assignments = [],
  getChildName,
  formatDueShort,
  onOpenAssignment,
}) {
  const handleCancel = () => onClose?.();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayBackdrop}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Assigned to student</Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.closeCircle}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={18} color="#0f172a" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>

          <Text style={styles.headline}>Work awaiting submission</Text>
          <Text style={styles.subhead}>
            Work you have assigned that has not been submitted yet. Open the planner event or assignment details.
          </Text>

          {!assignments.length ? (
            <Text style={styles.empty}>No assignments in this list right now.</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {assignments.map((a) => {
                const dueLine = formatDueShort(a.due_date);
                const statusLabel = a.status === 'in_progress' ? 'In progress' : 'Not started';
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.row}
                    onPress={() => onOpenAssignment?.(a)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Open assignment ${a.title || ''}`}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {a.title || 'Assignment'}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {typeof getChildName === 'function' ? getChildName(a.child_id) : ''}
                        {dueLine ? ` · ${dueLine}` : ''} · {statusLabel}
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelLink}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(4px)',
        }
      : {}),
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
    elevation: 13,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '90%',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        }
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 12,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    paddingRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subhead: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  empty: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 22,
  },
  list: {
    maxHeight: 320,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#f8fafc',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    gap: 12,
    marginTop: 14,
  },
  cancelLink: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
});
