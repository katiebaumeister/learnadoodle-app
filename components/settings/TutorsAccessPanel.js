import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { Plus, Copy } from 'lucide-react';
import { getFamilyMembers, inviteTutor, updateTutorScope } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function TutorsAccessPanel({ user }) {
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Tutor invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [inviteResultUrl, setInviteResultUrl] = useState(null);
  const [inviting, setInviting] = useState(false);
  
  // Child invite state
  const [childInviteEmail, setChildInviteEmail] = useState('');
  const [selectedChildForInvite, setSelectedChildForInvite] = useState(null);
  const [childInviteResultUrl, setChildInviteResultUrl] = useState(null);
  const [invitingChild, setInvitingChild] = useState(false);
  
  const [updatingTutorId, setUpdatingTutorId] = useState(null);

  const fetchFamilyMembers = async () => {
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

  useEffect(() => {
    fetchFamilyMembers();
  }, []);

  const toggleChildSelection = (childId) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const handleInviteTutor = async () => {
    if (!inviteEmail.trim()) {
      setError('Please enter an email for the tutor.');
      return;
    }
    if (selectedChildIds.length === 0) {
      setError('Please select at least one child the tutor can see.');
      return;
    }

    setInviting(true);
    setError(null);
    setInviteResultUrl(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: inviteEmail.trim(),
        role: 'tutor',
        child_ids: selectedChildIds,
      });
      if (err) throw err;
      setInviteResultUrl(data.invite_url);
      setInviteEmail('');
      setSelectedChildIds([]);
      toast.push('Invite sent successfully!', 'success');
      // Optionally refresh family members
      // await fetchFamilyMembers();
    } catch (err) {
      console.error('Error inviting tutor:', err);
      setError(err.message || 'Failed to invite tutor');
      toast.push('Failed to invite tutor', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleInviteChild = async () => {
    if (!childInviteEmail.trim()) {
      setError('Please enter an email for the child.');
      return;
    }
    if (!selectedChildForInvite) {
      setError('Please select which child record this invite is for.');
      return;
    }

    setInvitingChild(true);
    setError(null);
    setChildInviteResultUrl(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: childInviteEmail.trim(),
        role: 'child',
        child_ids: [selectedChildForInvite],
      });
      if (err) throw err;
      setChildInviteResultUrl(data.invite_url);
      setChildInviteEmail('');
      setSelectedChildForInvite(null);
      toast.push('Child invite sent successfully!', 'success');
    } catch (err) {
      console.error('Error inviting child:', err);
      setError(err.message || 'Failed to invite child');
      toast.push('Failed to invite child', 'error');
    } finally {
      setInvitingChild(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteResultUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteResultUrl);
        toast.push('Invite link copied to clipboard', 'success');
      } else {
        // Fallback for non-web platforms
        Alert.alert('Invite Link', inviteResultUrl);
      }
    } catch (e) {
      console.error('Failed to copy invite URL', e);
      toast.push('Failed to copy link', 'error');
    }
  };

  const handleUpdateTutorScope = async (tutorId, childId) => {
    if (!family) return;
    const tutors = family.members.filter((m) => (m.member_role || m.role) === 'tutor');
    const tutor = tutors.find((t) => t.id === tutorId);
    if (!tutor) return;

    const currentScope = tutor.child_scope || [];
    const newScope = currentScope.includes(childId)
      ? currentScope.filter((id) => id !== childId)
      : [...currentScope, childId];

    setUpdatingTutorId(tutorId);
    setError(null);
    try {
      const { data, error: err } = await updateTutorScope(tutorId, { child_ids: newScope });
      if (err) throw err;
      // Update local state
      setFamily({
        ...family,
        members: family.members.map((m) =>
          m.id === tutorId ? { ...m, child_scope: newScope } : m
        ),
      });
      toast.push('Tutor access updated', 'success');
    } catch (err) {
      console.error('Error updating tutor scope:', err);
      setError(err.message || 'Failed to update tutor access');
      toast.push('Failed to update tutor access', 'error');
    } finally {
      setUpdatingTutorId(null);
    }
  };


  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Invite Members</Text>
      <Text style={styles.sectionSubtitle}>
        Invite tutors and children to your family. Tutors can see selected children's data; children can see their own.
      </Text>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading family info…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {family && !loading && (
        <>
          {/* Invite tutor */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteTitle}>Invite a tutor</Text>
              {family.family_name && (
                <Text style={styles.familyNameText}>Family: {family.family_name}</Text>
              )}
            </View>

            <View style={styles.inviteForm}>
              <View style={styles.formField}>
                <Text style={styles.label}>Tutor email</Text>
                <TextInput
                  style={styles.input}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="tutor@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Which children can this tutor see?</Text>
                <View style={styles.childrenChips}>
                  {family.children.map((child) => {
                    const selected = selectedChildIds.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childChip,
                          selected && styles.childChipSelected,
                        ]}
                        onPress={() => toggleChildSelection(child.id)}
                      >
                        <Text
                          style={[
                            styles.childChipText,
                            selected && styles.childChipTextSelected,
                          ]}
                        >
                          {child.name || child.first_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {family.children.length === 0 && (
                    <Text style={styles.emptyText}>No children added yet.</Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.inviteButton, inviting && styles.inviteButtonDisabled]}
                onPress={handleInviteTutor}
                disabled={inviting}
              >
                {inviting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.inviteButtonText}>Sending invite…</Text>
                  </>
                ) : (
                  <>
                    <Plus size={14} color="#ffffff" />
                    <Text style={styles.inviteButtonText}>Send invite</Text>
                  </>
                )}
              </TouchableOpacity>

              {inviteResultUrl && (
                <View style={styles.inviteResult}>
                  <Text style={styles.inviteResultLabel}>Invite link:</Text>
                  <Text style={styles.inviteResultUrl} numberOfLines={1}>
                    {inviteResultUrl}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={handleCopyInvite}
                  >
                    <Copy size={12} color="#3b82f6" />
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Invite child */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteTitle}>Invite a child</Text>
              {family.family_name && (
                <Text style={styles.familyNameText}>Family: {family.family_name}</Text>
              )}
            </View>

            <View style={styles.inviteForm}>
              <View style={styles.formField}>
                <Text style={styles.label}>Child email</Text>
                <TextInput
                  style={styles.input}
                  value={childInviteEmail}
                  onChangeText={setChildInviteEmail}
                  placeholder="child@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Which child record is this for?</Text>
                <View style={styles.childrenChips}>
                  {family.children.map((child) => {
                    const selected = selectedChildForInvite === child.id;
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childChip,
                          selected && styles.childChipSelected,
                        ]}
                        onPress={() => setSelectedChildForInvite(child.id)}
                      >
                        <Text
                          style={[
                            styles.childChipText,
                            selected && styles.childChipTextSelected,
                          ]}
                        >
                          {child.name || child.first_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {family.children.length === 0 && (
                    <Text style={styles.emptyText}>No children added yet.</Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.inviteButton, invitingChild && styles.inviteButtonDisabled]}
                onPress={handleInviteChild}
                disabled={invitingChild}
              >
                {invitingChild ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.inviteButtonText}>Sending invite…</Text>
                  </>
                ) : (
                  <>
                    <Plus size={14} color="#ffffff" />
                    <Text style={styles.inviteButtonText}>Send invite</Text>
                  </>
                )}
              </TouchableOpacity>

              {childInviteResultUrl && (
                <View style={styles.inviteResult}>
                  <Text style={styles.inviteResultLabel}>Invite link:</Text>
                  <Text style={styles.inviteResultUrl} numberOfLines={1}>
                    {childInviteResultUrl}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={async () => {
                      if (Platform.OS === 'web' && navigator.clipboard) {
                        await navigator.clipboard.writeText(childInviteResultUrl);
                        toast.push('Invite link copied to clipboard', 'success');
                      } else {
                        Alert.alert('Invite Link', childInviteResultUrl);
                      }
                    }}
                  >
                    <Copy size={12} color="#3b82f6" />
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
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
  },
  errorText: {
    fontSize: 11,
    color: '#dc2626',
  },
  inviteCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    gap: 16,
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  familyNameText: {
    fontSize: 10,
    color: '#6b7280',
  },
  inviteForm: {
    gap: 12,
  },
  formField: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  childrenChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  childChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  childChipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  childChipInScope: {
    backgroundColor: '#d1fae5',
    borderColor: '#6ee7b7',
  },
  childChipText: {
    fontSize: 11,
    color: '#6b7280',
  },
  childChipTextSelected: {
    color: '#1e40af',
    fontWeight: '500',
  },
  childChipTextInScope: {
    color: '#065f46',
    fontWeight: '500',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  inviteButtonDisabled: {
    opacity: 0.6,
  },
  inviteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  inviteResult: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  inviteResultLabel: {
    fontSize: 11,
    color: '#374151',
  },
  inviteResultUrl: {
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
    color: '#111827',
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  copyButtonText: {
    fontSize: 11,
    color: '#3b82f6',
  },
  tutorsCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    gap: 12,
  },
  tutorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tutorsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  refreshText: {
    fontSize: 11,
    color: '#6b7280',
  },
  tutorsList: {
    gap: 12,
  },
  tutorItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 8,
  },
  tutorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tutorName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  tutorEmail: {
    fontSize: 11,
    color: '#6b7280',
  },
  tutorScopeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});

