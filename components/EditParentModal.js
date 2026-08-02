import React, { useEffect, useState } from 'react';
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
  createGuestMember,
  updateGuestMember,
  deleteGuestMember,
  inviteTutor,
  saveOnboardingParentProfile,
  updateFamilyName,
} from '../lib/apiClient';
import { useToast } from './Toast';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import FamilyAdultProfileFields, { isFamilyAdultProfileComplete } from './family/FamilyAdultProfileFields';
import FamilyMemberAccountSection from './family/FamilyMemberAccountSection';
import { DEFAULT_AVATAR_KEY } from '../lib/onboardingProfAvatars';

export default function EditParentModal({
  visible,
  onClose,
  parent,
  onParentUpdated,
  onInviteSent,
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState('');
  const [avatarKey, setAvatarKey] = useState(DEFAULT_AVATAR_KEY);
  const [savedGuestId, setSavedGuestId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);

  const isSelf = parent?.isSelf === true;
  const isNew = !isSelf && (parent?.isNew === true || (!parent?.id && !parent?.isPendingInvite));
  const isPendingInvite = !isSelf && (parent?.isPendingInvite === true || parent?.invite_status === 'pending');
  const isGuest = !isSelf && Boolean(savedGuestId || parent?.isGuest);
  const profileSaved = Boolean(isSelf || savedGuestId || parent?.isGuest || isPendingInvite);
  const modalTitle = isNew && !savedGuestId ? 'Add parent' : (displayName.trim() || 'Parent');
  const canRemove = !isSelf && (isGuest || savedGuestId);

  useEffect(() => {
    if (!visible || !parent) return;
    setDisplayName(parent.display_name || parent.name || '');
    setAvatarKey(parent.avatar_url || DEFAULT_AVATAR_KEY);
    setSavedGuestId(parent.isGuest ? String(parent.id || '') : null);
    setError(null);
  }, [visible, parent]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsSaving(false);
      setInviting(false);
    }
  }, [visible]);

  const persistSelfProfile = async () => {
    if (!isFamilyAdultProfileComplete(displayName, avatarKey)) {
      setError('Enter a name and choose an avatar.');
      return null;
    }
    const trimmed = displayName.trim();
    const { data: profileData, error: profileErr } = await saveOnboardingParentProfile({
      display_name: trimmed,
      avatar_url: avatarKey,
    });
    if (profileErr) throw profileErr;

    const { error: familyErr } = await updateFamilyName(trimmed);
    if (familyErr) throw familyErr;

    return {
      display_name: profileData?.display_name || trimmed,
      avatar_url: profileData?.avatar_url || avatarKey,
      isSelf: true,
    };
  };

  const persistProfile = async () => {
    if (!isFamilyAdultProfileComplete(displayName, avatarKey)) {
      setError('Enter a name and choose an avatar.');
      return null;
    }
    const payload = {
      role: 'parent',
      display_name: displayName.trim(),
      avatar_url: avatarKey,
    };
    if (savedGuestId) {
      const { data, error: patchErr } = await updateGuestMember(savedGuestId, payload);
      if (patchErr) throw patchErr;
      return data;
    }
    if (isNew) {
      const { data, error: createErr } = await createGuestMember(payload);
      if (createErr) throw createErr;
      if (data?.id) setSavedGuestId(String(data.id));
      return data;
    }
    return null;
  };

  const handlePrimarySave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (isSelf) {
        const saved = await persistSelfProfile();
        toast.push('Parent profile saved.', 'success');
        onParentUpdated?.(saved);
        onClose?.();
        return;
      }

      await persistProfile();
      if (isPendingInvite && parent?.email) {
        const { data, error: inviteErr } = await inviteTutor({
          email: parent.email.trim(),
          role: 'parent',
          child_ids: [],
          parent_name: displayName.trim(),
          invited_avatar_url: avatarKey,
        });
        if (inviteErr) throw inviteErr;
        toast.push('Parent profile updated.', 'success');
        if (data?.invite_url) onInviteSent?.(data.invite_url);
      } else {
        toast.push(isNew && !savedGuestId ? 'Parent added.' : 'Parent profile saved.', 'success');
      }
      onParentUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not save parent profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvite = async (email) => {
    setInviting(true);
    setError(null);
    try {
      let guestId = savedGuestId;
      if (!guestId && isNew) {
        const created = await persistProfile();
        guestId = created?.id ? String(created.id) : savedGuestId;
      }
      const { data, error: inviteErr } = await inviteTutor({
        email: email.trim(),
        role: 'parent',
        child_ids: [],
        parent_name: displayName.trim(),
        invited_avatar_url: avatarKey,
        guest_member_id: guestId || null,
      });
      if (inviteErr) throw inviteErr;
      toast.push('Parent invite sent!', 'success');
      if (data?.invite_url) onInviteSent?.(data.invite_url);
      onParentUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!savedGuestId) {
      onClose?.();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const { error: delErr } = await deleteGuestMember(savedGuestId);
      if (delErr) throw delErr;
      toast.push('Parent removed.', 'success');
      onParentUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not remove parent.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!parent) return null;

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e?.stopPropagation?.()} style={styles.modalWrap}>
          <AppModalShell
            title={modalTitle}
            onClose={onClose}
            shellStyle={styles.compactShell}
            bodyStyle={styles.shellBody}
            contentContainerStyle={styles.contentContainer}
            footer={(
              <ModalFooter
                mode="edit"
                primaryLabel={isSaving ? 'Saving...' : (isNew && !profileSaved ? 'Add parent' : 'Save changes')}
                destructiveLabel={canRemove ? 'Remove parent' : null}
                onCancel={onClose}
                onDelete={canRemove ? handleRemove : undefined}
                onPrimary={handlePrimarySave}
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
                nameLabel={isSelf ? 'What should we call you?' : 'What should we call them?'}
                namePlaceholder={isSelf ? 'e.g. Robbie, Mom, Dad' : 'e.g. Katie, Mom, Professor Doodle'}
              />

              {isSelf ? (
                <FamilyMemberAccountSection
                  roleLabel="parent"
                  inviteStatus="connected"
                  connectedEmail={parent?.email || null}
                />
              ) : profileSaved ? (
                <FamilyMemberAccountSection
                  roleLabel="parent"
                  inviteStatus={isPendingInvite ? 'pending' : 'none'}
                  pendingEmail={parent?.email || null}
                  onSendInvite={handleSendInvite}
                  inviting={inviting}
                  disabled={isSaving}
                  autoOpenInvite={Boolean(parent?.openInviteForm)}
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
  modalWrap: {
    width: '100%',
    maxWidth: 720,
  },
  compactShell: {
    ...(Platform.OS === 'web'
      ? { height: 'auto', maxHeight: '90vh', minHeight: 360, borderRadius: 28, boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)' }
      : { height: 'auto', maxHeight: '86%', minHeight: 360 }),
    overflow: 'hidden',
  },
  shellBody: { paddingTop: 0, paddingBottom: 8 },
  contentContainer: { paddingBottom: 4 },
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
