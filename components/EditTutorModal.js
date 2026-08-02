import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal as RNModal,
  Platform,
  ScrollView,
} from 'react-native';
import {
  inviteTutor,
  updateTutorScope,
  createGuestMember,
  updateGuestMember,
  deleteGuestMember,
} from '../lib/apiClient';
import { useToast } from './Toast';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { DEFAULT_TUTOR_PROFILE, normalizeTutorProfile } from '../lib/permissions/userPermissionProfiles';
import FamilyAdultProfileFields, { isFamilyAdultProfileComplete } from './family/FamilyAdultProfileFields';
import FamilyMemberAccountSection from './family/FamilyMemberAccountSection';
import { DEFAULT_AVATAR_KEY } from '../lib/onboardingProfAvatars';

function normalizeScope(scope) {
  if (Array.isArray(scope)) return scope.map((x) => String(x)).filter(Boolean);
  if (typeof scope === 'string') {
    try {
      const parsed = JSON.parse(scope);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch (_) {
      return [];
    }
  }
  return [];
}

export default function EditTutorModal({
  visible,
  onClose,
  tutor,
  familyChildren = [],
  onTutorUpdated,
  onInviteSent,
}) {
  const toast = useToast();
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [avatarKey, setAvatarKey] = useState(DEFAULT_AVATAR_KEY);
  const [savedGuestId, setSavedGuestId] = useState(null);
  const [email, setEmail] = useState('');
  const [tutorPermissionProfile, setTutorPermissionProfile] = useState(DEFAULT_TUTOR_PROFILE);
  const [isSaving, setIsSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);

  const isNewTutor = tutor?.isNew === true || String(tutor?.id || '').startsWith('draft-');
  const isGuest = Boolean(tutor?.isGuest || savedGuestId);
  const isPendingInvite = !isNewTutor && !isGuest && (tutor?.invite_status === 'pending' || tutor?.isPendingInvite);
  const isConnected = !isNewTutor && !isGuest && !isPendingInvite && Boolean(tutor?.user_id || tutor?.email);
  const profileSaved = Boolean(isConnected || isPendingInvite || isGuest || savedGuestId);
  const tutorName = isNewTutor && !savedGuestId ? 'Add tutor' : (displayName.trim() || tutor?.name || tutor?.email || 'Tutor');
  const canRemove = Boolean(isConnected || isGuest || savedGuestId) && !isPendingInvite;

  const childOptions = useMemo(
    () =>
      (familyChildren || []).map((child) => ({
        id: String(child?.id || ''),
        name: child?.name || child?.first_name || 'Child',
      })),
    [familyChildren]
  );

  useEffect(() => {
    if (!visible || !tutor) return;
    const knownScope = normalizeScope(tutor.child_scope);
    const fallbackScope = childOptions.map((c) => c.id);
    const incomingEmail = String(tutor?.email || '').trim();
    const incomingName = String(tutor?.display_name || tutor?.name || '').trim();
    const normalizedName = incomingName && incomingName !== incomingEmail ? incomingName : '';
    setSelectedChildIds(knownScope.length > 0 ? knownScope : fallbackScope);
    setDisplayName(normalizedName);
    setAvatarKey(tutor?.avatar_url || DEFAULT_AVATAR_KEY);
    setEmail(incomingEmail);
    setSavedGuestId(tutor?.isGuest ? String(tutor.id || '') : null);
    setTutorPermissionProfile(normalizeTutorProfile(tutor?.tutor_permission_profile || DEFAULT_TUTOR_PROFILE));
    setError(null);
  }, [visible, tutor, childOptions]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsSaving(false);
      setInviting(false);
    }
  }, [visible]);

  const toggleChildAccess = (childId) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const persistGuestProfile = async () => {
    if (!isFamilyAdultProfileComplete(displayName, avatarKey)) {
      setError('Enter a name and choose an avatar.');
      return null;
    }
    if (selectedChildIds.length === 0) {
      setError('Select at least one child this tutor can access.');
      return null;
    }
    const payload = {
      role: 'tutor',
      display_name: displayName.trim(),
      avatar_url: avatarKey,
      child_ids: selectedChildIds,
      tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
    };
    if (savedGuestId) {
      const { data, error: patchErr } = await updateGuestMember(savedGuestId, payload);
      if (patchErr) throw patchErr;
      return data;
    }
    if (isNewTutor || isGuest) {
      const { data, error: createErr } = await createGuestMember(payload);
      if (createErr) throw createErr;
      if (data?.id) setSavedGuestId(String(data.id));
      return data;
    }
    return null;
  };

  const handleSave = async () => {
    if (!tutor) return;
    setIsSaving(true);
    setError(null);
    try {
      if (isConnected) {
        const { error: patchError } = await updateTutorScope(tutor.id, {
          child_ids: selectedChildIds,
          display_name: displayName.trim() || null,
          tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
        });
        if (patchError) throw patchError;
        toast.push('Tutor access updated.', 'success');
        onTutorUpdated?.();
        onClose?.();
        return;
      }

      if (isPendingInvite) {
        if (!email.trim()) {
          throw new Error('Enter an email address for this tutor.');
        }
        const { data, error: inviteError } = await inviteTutor({
          email: email.trim(),
          role: 'tutor',
          child_ids: selectedChildIds,
          tutor_name: displayName.trim() || null,
          invited_avatar_url: avatarKey,
          tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
        });
        if (inviteError) throw inviteError;
        toast.push('Tutor invite updated and re-sent.', 'success');
        if (data?.invite_url) onInviteSent?.(data.invite_url);
        onTutorUpdated?.();
        onClose?.();
        return;
      }

      await persistGuestProfile();
      toast.push(isNewTutor && !savedGuestId ? 'Tutor added.' : 'Tutor profile saved.', 'success');
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not update tutor settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvite = async (inviteEmail) => {
    setInviting(true);
    setError(null);
    try {
      let guestId = savedGuestId;
      if (!guestId) {
        const created = await persistGuestProfile();
        guestId = created?.id ? String(created.id) : savedGuestId;
      }
      const { data, error: inviteError } = await inviteTutor({
        email: inviteEmail.trim(),
        role: 'tutor',
        child_ids: selectedChildIds,
        tutor_name: displayName.trim() || null,
        invited_avatar_url: avatarKey,
        tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
        guest_member_id: guestId || null,
      });
      if (inviteError) throw inviteError;
      toast.push('Tutor invite sent!', 'success');
      if (data?.invite_url) onInviteSent?.(data.invite_url);
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveAllAccess = async () => {
    if (!tutor || isPendingInvite) return;
    setIsSaving(true);
    setError(null);
    try {
      if (savedGuestId) {
        const { error: delErr } = await deleteGuestMember(savedGuestId);
        if (delErr) throw delErr;
        toast.push('Tutor removed.', 'success');
      } else {
        const { error: patchError } = await updateTutorScope(tutor.id, { child_ids: [] });
        if (patchError) throw patchError;
        toast.push('Tutor access removed.', 'success');
      }
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not remove tutor access.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!tutor) return null;

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e?.stopPropagation?.()} style={styles.modalWrap}>
          <AppModalShell
            title={tutorName}
            onClose={onClose}
            shellStyle={styles.compactShell}
            bodyStyle={styles.shellBody}
            contentContainerStyle={styles.contentContainer}
            footer={(
              <ModalFooter
                mode="edit"
                primaryLabel={isSaving ? 'Saving...' : (isNewTutor && !profileSaved ? 'Add tutor' : 'Save changes')}
                destructiveLabel={
                  canRemove
                    ? (isConnected ? 'Remove access' : 'Remove tutor')
                    : null
                }
                onCancel={onClose}
                onDelete={canRemove ? handleRemoveAllAccess : undefined}
                onPrimary={handleSave}
                accent="#9ECFFB"
                disabled={isSaving || inviting}
                loading={isSaving}
              />
            )}
          >
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false}>
              <FamilyAdultProfileFields
                displayName={displayName}
                avatarKey={avatarKey}
                onDisplayNameChange={setDisplayName}
                onAvatarChange={setAvatarKey}
                disabled={isSaving || inviting}
                nameLabel="What should we call them?"
                namePlaceholder="Professor Doodle"
              />

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Children access</Text>
                <Text style={styles.fieldHint}>Select which children this tutor can view and manage.</Text>
                <View style={styles.childChipRow}>
                  {childOptions.length === 0 ? (
                    <Text style={styles.fieldHint}>Add a child to your family first, then assign tutor access.</Text>
                  ) : null}
                  {childOptions.map((child) => {
                    const isSelected = selectedChildIds.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[styles.childChip, isSelected && styles.childChipActive]}
                        onPress={() => toggleChildAccess(child.id)}
                        activeOpacity={0.85}
                        disabled={isSaving || inviting}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.childChipText, isSelected && styles.childChipTextActive]}>
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {profileSaved && !isConnected ? (
                <FamilyMemberAccountSection
                  roleLabel="tutor"
                  inviteStatus={isPendingInvite ? 'pending' : 'none'}
                  pendingEmail={email || null}
                  onSendInvite={handleSendInvite}
                  inviting={inviting}
                  disabled={isSaving}
                  autoOpenInvite={Boolean(tutor?.openInviteForm)}
                />
              ) : null}

              {isConnected ? (
                <FamilyMemberAccountSection
                  roleLabel="tutor"
                  inviteStatus="connected"
                  connectedEmail={email || null}
                />
              ) : null}
            </ScrollView>
          </AppModalShell>
        </TouchableOpacity>
      </TouchableOpacity>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: { width: '100%', maxWidth: 720 },
  compactShell: {
    ...(Platform.OS === 'web'
      ? { height: 'auto', maxHeight: '90vh', minHeight: 360, borderRadius: 28, boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)' }
      : { height: 'auto', maxHeight: '86%', minHeight: 360 }),
    overflow: 'hidden',
  },
  shellBody: { paddingTop: 0, paddingBottom: 8 },
  contentContainer: { paddingBottom: 4 },
  formGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
  },
  fieldHint: { fontSize: 13, color: '#64748b', lineHeight: 19, marginTop: 4 },
  childChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  childChip: {
    minHeight: 36,
    minWidth: 96,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childChipActive: {
    borderColor: '#9ECFFB',
    backgroundColor: 'rgba(158, 207, 251, 0.25)',
  },
  childChipText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { fontSize: 13, color: '#dc2626' },
});
