import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { AlertTriangle } from 'lucide-react';
import { getFamilyMembers } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import EditChildModal from '../EditChildModal';

export default function FamilyPanel({ user }) {
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingChild, setEditingChild] = useState(null);
  const [showEditChildModal, setShowEditChildModal] = useState(false);
  const [familyId, setFamilyId] = useState(null);

  useEffect(() => {
    const loadFamily = async () => {
      setLoading(true);
      setError(null);
      try {
        // First get family_id from user profile
        let profileFamilyId = null;
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', authUser.id)
            .maybeSingle();
          if (profile?.family_id) {
            profileFamilyId = profile.family_id;
            setFamilyId(profile.family_id);
          }
        }
        
        const { data, error: err } = await getFamilyMembers();
        if (err) throw err;
        setFamily(data);
        const effectiveFamilyId = data?.id || profileFamilyId;
        if (effectiveFamilyId) {
          setFamilyId(effectiveFamilyId);
        }
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
            <ChildManagementItem 
              key={child.id} 
              child={child} 
              familyId={family?.id}
              onEdit={() => {
                setEditingChild(child);
                setShowEditChildModal(true);
              }}
            />
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

      {/* Edit Child Modal */}
      <EditChildModal
        visible={showEditChildModal}
        onClose={() => {
          setShowEditChildModal(false);
          setEditingChild(null);
        }}
        child={editingChild}
        familyId={family?.id || familyId}
        onChildUpdated={(updatedChild) => {
          // Optimistically update the child in the list immediately
          if (updatedChild && family) {
            setFamily(prevFamily => {
              if (!prevFamily) return prevFamily;
              const updatedChildren = (prevFamily.children || []).map(child => 
                child.id === updatedChild.id 
                  ? { 
                      ...child, 
                      first_name: updatedChild.first_name || updatedChild.name,
                      name: updatedChild.first_name || updatedChild.name,
                      // Include other fields that might have changed
                      nickname: updatedChild.nickname,
                      age: updatedChild.age,
                      grade: updatedChild.grade,
                      avatar: updatedChild.avatar,
                      archived: updatedChild.archived
                    }
                  : child
              );
              return { ...prevFamily, children: updatedChildren };
            });
          }
          
          // Dispatch global event to refresh children in other components (sidebar, etc.)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
          }
          
          // Then reload family data to ensure consistency
          const loadFamily = async () => {
            try {
              const { data, error: err } = await getFamilyMembers();
              if (!err && data) {
                setFamily(data);
              }
            } catch (err) {
              console.error('Error reloading family:', err);
            }
          };
          loadFamily();
        }}
        onChildDeleted={() => {
          // Reload family data to refresh the list
          const loadFamily = async () => {
            try {
              const { data, error: err } = await getFamilyMembers();
              if (!err && data) {
                setFamily(data);
              }
            } catch (err) {
              console.error('Error reloading family:', err);
            }
          };
          loadFamily();
        }}
      />
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
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
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
  editHint: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
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

function ChildManagementItem({ child, familyId, onEdit }) {
  const childName = child.name || child.first_name || 'Child';

  return (
    <TouchableOpacity 
      style={styles.memberItem}
      onPress={onEdit}
      activeOpacity={0.7}
    >
      <View style={styles.childHeader}>
        <View style={styles.childInfo}>
          <Text style={styles.memberName}>{childName}</Text>
          {child.archived && (
            <Text style={styles.archivedBadge}>Archived</Text>
          )}
        </View>
        <Text style={styles.editHint}>Tap to edit</Text>
      </View>
    </TouchableOpacity>
  );
}

