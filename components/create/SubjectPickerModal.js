import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, ChevronRight, Plus } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { parseChildIds } from '../../lib/services/subjectsClient';

function buildSubjectPickerOptions(subjects, children) {
  const childNameById = {};
  (children || []).forEach((child) => {
    const id = String(child?.id || '').trim();
    if (!id) return;
    childNameById[id] = child?.first_name || child?.name || child?.full_name || 'Student';
  });

  return (subjects || [])
    .map((subject) => {
      const id = String(subject?.id || '').trim();
      if (!id) return null;
      const candidateChildIds = []
        .concat(
          Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [],
          Array.isArray(subject?.assigned_children) ? subject.assigned_children : [],
          Array.isArray(subject?.child_ids) ? subject.child_ids : [],
          Array.isArray(subject?.childIds) ? subject.childIds : [],
          subject?.child_id ? parseChildIds(subject.child_id) : [],
        )
        .map((childId) => String(childId || '').trim())
        .filter(Boolean);
      const childIds = Array.from(new Set(candidateChildIds));
      const studentLabel = childIds
        .map((childId) => childNameById[childId] || null)
        .filter(Boolean)
        .join(', ');
      return {
        id,
        subject,
        name: String(subject?.name || '').trim() || 'Subject',
        childIds,
        studentLabel,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function SubjectPickerModal({
  visible,
  onClose,
  subjects = [],
  children = [],
  title = 'Choose a subject',
  subtitle = 'Pick the subject you want to update.',
  emptyMessage = 'No subjects yet.',
  onSelect,
  onCreateNew = null,
  createNewLabel = 'Create new subject',
}) {
  const options = useMemo(
    () => buildSubjectPickerOptions(subjects, children),
    [subjects, children],
  );

  const handleSelect = (option) => {
    onSelect?.(option?.subject || null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {options.length > 0 ? (
            <View style={styles.list}>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={`subject-picker-${option.id}`}
                  style={[
                    styles.item,
                    index === options.length - 1 && styles.itemLast,
                  ]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.75}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemText}>{option.name}</Text>
                    {option.studentLabel ? (
                      <View style={styles.studentsRow}>
                        <ChildAvatarCluster
                          childIds={option.childIds}
                          familyChildren={children}
                          size={28}
                          overlap={-8}
                        />
                        <Text style={styles.studentsText}>{option.studentLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color="#6b7280" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            {typeof onCreateNew === 'function' ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onCreateNew}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={createNewLabel}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.primaryText}>{createNewLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  list: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  item: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  itemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  studentsText: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
    fontSize: 14,
    color: '#94A3B8',
  },
  emptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
