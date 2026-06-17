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
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  createGuestMember,
  updateGuestMember,
  deleteGuestMember,
  inviteTutor,
} from '../lib/apiClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
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
  const [showDangerZone, setShowDangerZone] = useState(false);

  const isNew = parent?.isNew === true || (!parent?.id && !parent?.isPendingInvite);
  const isPendingInvite = parent?.isPendingInvite === true || parent?.invite_status === 'pending';
  const isGuest = Boolean(savedGuestId || parent?.isGuest);
  const profileSaved = Boolean(savedGuestId || parent?.isGuest || isPendingInvite);
  const modalTitle = isNew && !savedGuestId ? 'Add parent' : (displayName.trim() || 'Parent');

  useEffect(() => {
    if (!visible || !parent) return;
    setDisplayName(parent.display_name || parent.name || '');
    setAvatarKey(parent.avatar_url || DEFAULT_AVATAR_KEY);
    setSavedGuestId(parent.isGuest ? String(parent.id || '') : null);
    setError(null);
    setShowDangerZone(false);
  }, [visible, parent]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsSaving(false);
      setInviting(false);
      setShowDangerZone(false);
    }
  }, [visible]);

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
      if (isNew && !isPendingInvite) {
        // Keep modal open so user can invite from Account section
        return;
      }
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
                destructiveLabel={isGuest || savedGuestId ? 'Remove parent' : null}
                onCancel={onClose}
                onDelete={isGuest || savedGuestId ? () => setShowDangerZone((v) => !v) : undefined}
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
              />

              {profileSaved ? (
                <FamilyMemberAccountSection
                  roleLabel="parent"
                  inviteStatus={isPendingInvite ? 'pending' : 'none'}
                  pendingEmail={parent?.email || null}
                  onSendInvite={handleSendInvite}
                  inviting={inviting}
                  disabled={isSaving}
                />
              ) : null}

              {(isGuest || savedGuestId) && !isPendingInvite ? (
                <View style={styles.dangerZoneAccordion}>
                  <TouchableOpacity
                    onPress={() => setShowDangerZone((v) => !v)}
                    style={styles.dangerZoneHeader}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.dangerZoneHeaderLeft}>
                      <AlertTriangle size={16} color={colors.redBold || '#dc2626'} />
                      <Text style={styles.dangerZoneTitle}>Danger zone</Text>
                    </View>
                    {showDangerZone ? (
                      <ChevronUp size={20} color={colors.redBold || '#dc2626'} />
                    ) : (
                      <ChevronDown size={20} color={colors.redBold || '#dc2626'} />
                    )}
                  </TouchableOpacity>
                  {showDangerZone ? (
                    <View style={styles.dangerZoneContent}>
                      <Text style={styles.dangerHint}>
                        Remove this parent profile from your family. You can add them again anytime.
                      </Text>
                      <TouchableOpacity
                        style={styles.dangerButton}
                        onPress={handleRemove}
                        disabled={isSaving}
                        {...(Platform.OS === 'web' && { cursor: isSaving ? 'not-allowed' : 'pointer' })}
                      >
                        <Text style={styles.dangerButtonText}>
                          {isSaving ? 'Removing...' : 'Remove parent'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
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
    maxWidth: 860,
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
  dangerZoneAccordion: {
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    backgroundColor: 'rgba(254, 242, 242, 0.5)',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  dangerZoneHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerZoneTitle: { fontSize: 14, fontWeight: '600', color: colors.redBold || '#dc2626' },
  dangerZoneContent: { marginTop: 12, gap: 10 },
  dangerHint: { fontSize: 12, lineHeight: 18, color: '#6b7280' },
  dangerButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.redBold || '#dc2626',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  dangerButtonText: { fontSize: 13, fontWeight: '600', color: '#ffffff' },
});
