import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

export default function DangerZone({ familyId, childId, childName, onDeleted, onRestored }) {
  const [confirmName, setConfirmName] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleArchive = async () => {
    Alert.alert(
      'Archive Child',
      `Are you sure you want to archive ${childName}? This will hide them from planners and reports, but data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);
            const { data, error } = await supabase.rpc('archive_child', {
              _family: familyId,
              _child: childId
            });

            setArchiving(false);

            if (error || !data?.ok) {
              Alert.alert('Error', 'Failed to archive child');
              return;
            }

            Alert.alert('Success', 'Child archived successfully');
            onDeleted?.();
          }
        }
      ]
    );
  };

  const handleRestore = async () => {
    setRestoring(true);
    const { data, error } = await supabase.rpc('restore_child', {
      _family: familyId,
      _child: childId
    });

    setRestoring(false);

    if (error || !data?.ok) {
      const reason = data?.reason || 'unknown';
      Alert.alert(
        'Error',
        reason === 'forbidden' ? 'You do not have permission' :
        reason === 'not_found' ? 'Child not found' :
        'Failed to restore child'
      );
      return;
    }

    Alert.alert('Success', 'Child restored successfully');
    onRestored?.();
  };

  const handleDelete = async () => {
    if (confirmName.trim().toLowerCase() !== childName.trim().toLowerCase()) {
      Alert.alert('Error', 'Name does not match');
      return;
    }

    Alert.alert(
      'Delete Permanently',
      `This will permanently delete ${childName} and ALL their data including sessions, goals, rules, and progress. This CANNOT be undone.\n\nAre you absolutely sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { data, error } = await supabase.rpc('delete_child_permanently', {
              _family: familyId,
              _child: childId,
              _confirm_name: confirmName
            });

            setDeleting(false);

            if (error || !data?.ok) {
              const reason = data?.reason || 'unknown';
              Alert.alert(
                'Error',
                reason === 'name_mismatch' ? 'Name does not match' :
                reason === 'forbidden' ? 'You do not have permission' :
                'Failed to delete child'
              );
              return;
            }

            Alert.alert('Deleted', 'Child has been permanently deleted');
            onDeleted?.();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AlertTriangle size={20} color={colors.redBold} />
        <Text style={styles.headerText}>Danger Zone</Text>
      </View>

      {/* Archive Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Archive child</Text>
        <Text style={styles.sectionDescription}>
          Hides {childName} from Planner and reports. Data is preserved and can be restored.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.archiveButton}
            onPress={handleArchive}
            disabled={archiving}
          >
            <Text style={styles.archiveButtonText}>
              {archiving ? 'Archiving...' : 'Archive'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={restoring}
          >
            <Text style={styles.restoreButtonText}>
              {restoring ? 'Restoring...' : 'Restore'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Delete Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delete permanently</Text>
        <Text style={styles.sectionDescription}>
          This removes all sessions, goals, overrides, and cached days for{' '}
          <Text style={styles.bold}>{childName}</Text>. This cannot be undone.
        </Text>
        
        <Text style={styles.inputLabel}>
          Type the child's name to confirm
        </Text>
        <TextInput
          style={styles.input}
          value={confirmName}
          onChangeText={setConfirmName}
          placeholder={childName}
          autoCapitalize="words"
        />

        <TouchableOpacity
          style={[
            styles.deleteButton,
            confirmName.trim().toLowerCase() !== childName.trim().toLowerCase() && styles.deleteButtonDisabled
          ]}
          onPress={handleDelete}
          disabled={
            confirmName.trim().toLowerCase() !== childName.trim().toLowerCase() || deleting
          }
        >
          <Text style={styles.deleteButtonText}>
            {deleting ? 'Deleting...' : `Delete ${childName}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.redSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.redBold + '40',
    padding: 16,
    marginTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  archiveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  archiveButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  restoreButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  inputLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: colors.redBold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: colors.redSoft,
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
});
