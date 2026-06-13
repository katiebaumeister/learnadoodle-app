import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react';
import { useToast } from '../Toast';
import { flattenClassworkPlacementOptions } from '../../lib/subjectClassworkModel';
import { updateAssignmentPlacement } from '../../lib/services/assignmentPlacementClient';

export default function AssignPlacementModal({
  visible,
  onClose,
  assignment,
  units = [],
  familyId,
  onSaved,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => flattenClassworkPlacementOptions(units), [units]);

  const handleSelect = async (option) => {
    if (!assignment?.id) return;
    setSaving(true);
    try {
      await updateAssignmentPlacement({
        assignmentId: assignment.id,
        familyId,
        unitId: option.unitId,
        lessonId: option.lessonId,
        lessonTitle: option.lessonId
          ? option.label.split(' · ').slice(-1)[0]
          : null,
        unitTitle: option.unitId ? option.label.split(' · ')[0] : null,
        linkedEventIds: assignment.linked_event_ids,
      });
      toast.push('Assignment moved', 'success');
      onSaved?.();
    } catch (err) {
      toast.push(err?.message || 'Could not move assignment', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Attach to lesson</Text>
            <TouchableOpacity onPress={onClose} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>
            {assignment?.title || 'Assignment'}
          </Text>
          {saving ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color="#9ECFFB" />
          ) : (
            <ScrollView style={styles.list}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={styles.option}
                  onPress={() => handleSelect(option)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
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
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  list: {
    padding: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 15,
    color: '#334155',
  },
});
