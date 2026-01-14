import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { AlertTriangle, Edit } from 'lucide-react';
import { getFamilyMembers } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import EditChildModal from '../EditChildModal';

export default function FamilyPanel({ user }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingChild, setEditingChild] = useState(null);
  const [showEditChildModal, setShowEditChildModal] = useState(false);
  const [familyId, setFamilyId] = useState(null);
  const [hoveredChildId, setHoveredChildId] = useState(null);

  const styles = createStyles(tokens);

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
          <ActivityIndicator size="small" color={tokens.accent} />
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

      <View style={styles.membersList}>
        <Text style={styles.membersSectionTitle}>Parents</Text>
        {parents.length === 0 ? (
          <Text style={styles.emptyText}>No parents found</Text>
        ) : (
          parents.map((member) => (
            <View key={member.id} style={styles.memberItem}>
              <Text style={styles.memberName}>{family?.family_name || member.email || 'Parent'}</Text>
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
          children.map((child) => {
            const childName = child.name || child.first_name || 'Child';
            const isHovered = hoveredChildId === child.id;
            return (
              <TouchableOpacity
                key={child.id}
                style={styles.childListItem}
                onPress={() => {
                  setEditingChild(child);
                  setShowEditChildModal(true);
                }}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && {
                  onMouseEnter: () => setHoveredChildId(child.id),
                  onMouseLeave: () => setHoveredChildId(null),
                })}
              >
                <View style={styles.childListItemContent}>
                  <Text style={[
                    styles.childListItemText,
                    isHovered && styles.childListItemTextHovered
                  ]}>
                    {childName}
                    {child.archived && ' (Archived)'}
                  </Text>
                  <View style={styles.childEditIcon}>
                    <Edit size={14} color={tokens.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.membersSectionTitle}>Tutors</Text>
        {tutors.length === 0 ? (
          <Text style={styles.emptyText}>No tutors yet. Invite one in the Invite Members tab.</Text>
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
            }
          };
          loadFamily();
        }}
      />
    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 14,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
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
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
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
      fontFamily: typography.fonts.sans,
      color: '#dc2626',
    },
    familyNameCard: {
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 12,
      marginBottom: 16,
    },
    familyNameLabel: {
      fontSize: 11,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    familyName: {
      fontSize: 16,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
    },
    membersList: {
      gap: 16,
    },
    membersSectionTitle: {
      fontSize: 12,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginTop: 8,
      marginBottom: 8,
    },
    memberItem: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 8,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    memberName: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
      marginBottom: 4,
    },
    memberEmail: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
    },
    memberScope: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: '#059669',
      fontStyle: 'italic',
    },
    emptyText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textMuted,
      fontStyle: 'italic',
    },
    childListItem: {
      paddingVertical: 0,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    childListItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    childListItemText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    childListItemTextHovered: {
      color: '#2563eb',
    },
    childEditIcon: {
      marginLeft: 8,
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
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      backgroundColor: tokens.bgSubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    editHint: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textMuted,
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
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: colors.redBold || '#dc2626',
    },
    dangerSection: {
      backgroundColor: tokens.card,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 12,
      marginBottom: 8,
    },
    dangerSectionTitle: {
      fontSize: 13,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 4,
    },
    dangerSectionDescription: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      lineHeight: 16,
      marginBottom: 12,
    },
    bold: {
      fontWeight: typography.weights.semibold,
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
      borderColor: tokens.border,
      backgroundColor: tokens.card,
    },
    dangerButtonText: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    inputLabel: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
    },
    dangerInput: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
      backgroundColor: tokens.card,
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
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: '#ffffff',
    },
  });
}

