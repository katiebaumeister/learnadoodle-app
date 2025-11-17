import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { AlertTriangle } from 'lucide-react';
import { getFamilyMembers } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function FamilyPanel({ user }) {
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadFamily = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await getFamilyMembers();
        if (err) throw err;
        setFamily(data);
      } catch (err) {
        console.error('Error loading family:', err);
        setError(err.message || 'Failed to load family info');
      } finally {
        setLoading(false);
      }
    };
    loadFamily();
  }, []);

  if (loading) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Family & Members</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading family info...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Family & Members</Text>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  const parents = (family?.members || []).filter(
    (m) => (m.member_role || m.role) === 'parent'
  );
  const tutors = (family?.members || []).filter(
    (m) => (m.member_role || m.role) === 'tutor'
  );
  const children = family?.children || [];

  return (
    <View>
      <Text style={styles.sectionTitle}>Family & Members</Text>
      <Text style={styles.sectionSubtitle}>
        Show family name and list of members. Later: invite links + roles.
      </Text>

      {family?.family_name && (
        <View style={styles.familyNameCard}>
          <Text style={styles.familyNameLabel}>Family Name</Text>
          <Text style={styles.familyName}>{family.family_name}</Text>
        </View>
      )}

      <View style={styles.membersList}>
        <Text style={styles.membersSectionTitle}>Parents</Text>
        {parents.length === 0 ? (
          <Text style={styles.emptyText}>No parents found</Text>
        ) : (
          parents.map((member) => (
            <View key={member.id} style={styles.memberItem}>
              <Text style={styles.memberName}>{member.name || member.email || 'Parent'}</Text>
              {member.email && (
                <Text style={styles.memberEmail}>{member.email}</Text>
              )}
            </View>
          ))
        )}

        <Text style={styles.membersSectionTitle}>Children</Text>
        {children.length === 0 ? (
          <Text style={styles.emptyText}>No children added yet</Text>
        ) : (
          children.map((child) => (
            <ChildManagementItem key={child.id} child={child} familyId={family?.id} />
          ))
        )}

        <Text style={styles.membersSectionTitle}>Tutors</Text>
        {tutors.length === 0 ? (
          <Text style={styles.emptyText}>No tutors yet. Invite one in the Tutors & Access tab.</Text>
        ) : (
          tutors.map((tutor) => (
            <View key={tutor.id} style={styles.memberItem}>
              <Text style={styles.memberName}>{tutor.name || tutor.email || 'Tutor'}</Text>
              {tutor.email && (
                <Text style={styles.memberEmail}>{tutor.email}</Text>
              )}
              {tutor.child_scope && tutor.child_scope.length > 0 && (
                <Text style={styles.memberScope}>
                  Can see: {tutor.child_scope.map(id => {
                    const child = children.find(c => c.id === id);
                    return child?.name || child?.first_name || id;
                  }).join(', ')}
                </Text>
              )}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
  },
  familyNameCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 16,
  },
  familyNameLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  familyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  membersList: {
    gap: 16,
  },
  membersSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 8,
  },
  memberItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  memberName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  memberScope: {
    fontSize: 11,
    color: '#059669',
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  childInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archivedBadge: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  manageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  manageButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  dangerZone: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.redSoft || '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: (colors.redBold || '#dc2626') + '40',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  dangerZoneTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.redBold || '#dc2626',
  },
  dangerSection: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 8,
  },
  dangerSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  dangerSectionDescription: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 16,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
  dangerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dangerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  dangerButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  inputLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  dangerInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: colors.redBold || '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: colors.redSoft || '#fef2f2',
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});

function ChildManagementItem({ child, familyId }) {
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isArchived, setIsArchived] = useState(child.archived || false);

  const childName = child.name || child.first_name || 'Child';

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
              _child: child.id
            });

            setArchiving(false);

            if (error || !data?.ok) {
              Alert.alert('Error', 'Failed to archive child');
              return;
            }

            Alert.alert('Success', 'Child archived successfully');
            setIsArchived(true);
            setShowDangerZone(false);
            // Refresh the page to update the list
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        }
      ]
    );
  };

  const handleRestore = async () => {
    setRestoring(true);
    const { data, error } = await supabase.rpc('restore_child', {
      _family: familyId,
      _child: child.id
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
    setIsArchived(false);
    setShowDangerZone(false);
    // Refresh the page to update the list
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
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
              _child: child.id,
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
            // Refresh the page to update the list
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.memberItem}>
      <View style={styles.childHeader}>
        <View style={styles.childInfo}>
          <Text style={styles.memberName}>{childName}</Text>
          {isArchived && (
            <Text style={styles.archivedBadge}>Archived</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.manageButton}
          onPress={() => setShowDangerZone(!showDangerZone)}
        >
          <Text style={styles.manageButtonText}>
            {showDangerZone ? 'Hide' : 'Manage'}
          </Text>
        </TouchableOpacity>
      </View>

      {showDangerZone && (
        <View style={styles.dangerZone}>
          <View style={styles.dangerZoneHeader}>
            <AlertTriangle size={16} color={colors.redBold || '#dc2626'} />
            <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
          </View>

          {/* Archive Section */}
          <View style={styles.dangerSection}>
            <Text style={styles.dangerSectionTitle}>Archive child</Text>
            <Text style={styles.dangerSectionDescription}>
              Hides {childName} from Planner and reports. Data is preserved and can be restored.
            </Text>
            <View style={styles.dangerActions}>
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleArchive}
                disabled={archiving || isArchived}
              >
                <Text style={styles.dangerButtonText}>
                  {archiving ? 'Archiving...' : 'Archive'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleRestore}
                disabled={restoring || !isArchived}
              >
                <Text style={styles.dangerButtonText}>
                  {restoring ? 'Restoring...' : 'Restore'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Delete Section */}
          <View style={styles.dangerSection}>
            <Text style={styles.dangerSectionTitle}>Delete permanently</Text>
            <Text style={styles.dangerSectionDescription}>
              This removes all sessions, goals, overrides, and cached days for{' '}
              <Text style={styles.bold}>{childName}</Text>. This cannot be undone.
            </Text>
            
            <Text style={styles.inputLabel}>
              Type the child's name to confirm
            </Text>
            <TextInput
              style={styles.dangerInput}
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
      )}
    </View>
  );
}

