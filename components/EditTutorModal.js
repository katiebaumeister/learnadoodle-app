import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal as RNModal,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle, CheckSquare, ChevronDown, ChevronUp, Square, UserCheck } from 'lucide-react';
import { inviteTutor, updateTutorScope } from '../lib/apiClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { DEFAULT_TUTOR_PROFILE, normalizeTutorProfile } from '../lib/permissions/userPermissionProfiles';

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
  children = [],
  onTutorUpdated,
}) {
  const TUTOR_PROFILE_OPTIONS = useMemo(
    () => [
      { id: 'viewer', label: 'Viewer Tutor' },
      { id: 'teaching', label: 'Teaching Tutor' },
      { id: 'manager', label: 'Lead Tutor' },
    ],
    []
  );
  const toast = useToast();
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [tutorPermissionProfile, setTutorPermissionProfile] = useState(DEFAULT_TUTOR_PROFILE);
  const [isSaving, setIsSaving] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [error, setError] = useState(null);
  const [savingInviteEmail, setSavingInviteEmail] = useState(false);

  const isNewTutor = tutor?.isNew === true || String(tutor?.id || '').startsWith('draft-');
  const isPendingInvite = !isNewTutor && tutor?.invite_status === 'pending';
  const tutorName = isNewTutor ? 'Add tutor' : (tutor?.name || tutor?.email || 'Tutor');
  const showPermissionField = isNewTutor || !!(String(email || tutor?.email || '').trim());
  const permissionEditable = isNewTutor || !isPendingInvite;

  const childOptions = useMemo(
    () =>
      (children || []).map((child) => ({
        id: String(child?.id || ''),
        name: child?.name || child?.first_name || 'Child',
      })),
    [children]
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
    setEmail(incomingEmail);
    setTutorPermissionProfile(normalizeTutorProfile(tutor?.tutor_permission_profile || DEFAULT_TUTOR_PROFILE));
    setError(null);
    setShowDangerZone(false);
  }, [visible, tutor, childOptions]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setShowDangerZone(false);
      setIsSaving(false);
      setSavingInviteEmail(false);
    }
  }, [visible]);

  const toggleChildAccess = (childId) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const handleSaveScope = async () => {
    if (!tutor) return;
    if (selectedChildIds.length === 0) {
      setError('Select at least one child this tutor can access.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (isNewTutor || isPendingInvite) {
        if (!email.trim()) {
          throw new Error('Enter an email address for this tutor.');
        }
        const { error: inviteError } = await inviteTutor({
          email: email.trim(),
          role: 'tutor',
          child_ids: selectedChildIds,
          tutor_name: displayName.trim() || null,
          tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
        });
        if (inviteError) throw inviteError;
        toast.push(isNewTutor ? 'Tutor added. Invite sent!' : 'Tutor invite updated and re-sent.', 'success');
      } else {
        const { error: patchError } = await updateTutorScope(tutor.id, {
          child_ids: selectedChildIds,
          display_name: displayName.trim() || null,
          tutor_permission_profile: normalizeTutorProfile(tutorPermissionProfile),
        });
        if (patchError) throw patchError;
        toast.push('Tutor access updated.', 'success');
      }
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not update tutor settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmailAndResend = async () => {
    if (!tutor || !isPendingInvite) return;
    if (!email.trim()) {
      setError('Enter an email address before resending.');
      return;
    }
    setSavingInviteEmail(true);
    setError(null);
    try {
      const { error: inviteError } = await inviteTutor({
        email: email.trim(),
        role: 'tutor',
        child_ids: selectedChildIds.length > 0 ? selectedChildIds : childOptions.map((c) => c.id),
        tutor_name: displayName.trim() || null,
      });
      if (inviteError) throw inviteError;
      toast.push('Tutor invite sent.', 'success');
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not resend invite.');
    } finally {
      setSavingInviteEmail(false);
    }
  };

  const handleRemoveAllAccess = async () => {
    if (!tutor || isPendingInvite) return;
    setIsSaving(true);
    setError(null);
    try {
      const { error: patchError } = await updateTutorScope(tutor.id, { child_ids: [] });
      if (patchError) throw patchError;
      setSelectedChildIds([]);
      toast.push('Tutor access removed.', 'success');
      onTutorUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not remove tutor access.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!tutor) return null;
  const hasAttachedEmail = !!(String(email || tutor?.email || '').trim());

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e?.stopPropagation?.()} style={styles.modalWrap}>
          <AppModalShell
            mode={isNewTutor ? 'add' : 'edit'}
            title={tutorName}
            onClose={onClose}
            contentContainerStyle={styles.scrollContent}
            footer={(
              <ModalFooter
                mode={isNewTutor ? 'add' : 'edit'}
                primaryLabel={
                  isSaving
                    ? 'Saving...'
                    : (isNewTutor ? 'Add Tutor' : 'Save changes')
                }
                destructiveLabel={isPendingInvite || isNewTutor ? null : 'Remove access'}
                onCancel={onClose}
                onDelete={isPendingInvite ? undefined : () => setShowDangerZone((v) => !v)}
                onPrimary={handleSaveScope}
                accent="#4BB39C"
                disabled={isSaving || savingInviteEmail}
                loading={isSaving}
              />
            )}
          >
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Children access</Text>
                <View style={styles.sectionRule} />
                <Text style={styles.sectionHint}>Select which children this tutor can view and manage.</Text>
                <View style={styles.childList}>
                  {childOptions.map((child) => {
                    const checked = selectedChildIds.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={styles.childRow}
                        onPress={() => toggleChildAccess(child.id)}
                        activeOpacity={0.85}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        {checked ? <CheckSquare size={18} color="#0ea5e9" /> : <Square size={18} color="#94a3b8" />}
                        <Text style={styles.childRowText}>{child.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.sectionRule} />
                <Text style={styles.inputLabel}>Tutor name</Text>
                <TextInput
                  style={styles.emailInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Professor Doodle"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {isNewTutor ? (
                  <>
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput
                      style={styles.emailInput}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="tutor@email.com"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                    />
                    <Text style={styles.connectedHint}>
                      An invite will be sent to this email when you add the tutor.
                    </Text>
                  </>
                ) : isPendingInvite ? (
                  <>
                    <Text style={styles.pendingTitle}>Invite sent</Text>
                    <TextInput
                      style={styles.emailInput}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="tutor@email.com"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                    />
                    <Text style={styles.pendingWait}>Waiting for acceptance</Text>
                    <View style={styles.accountButtons}>
                      <TouchableOpacity
                        style={styles.accountOutlineButton}
                        onPress={handleSaveEmailAndResend}
                        activeOpacity={0.8}
                        disabled={savingInviteEmail}
                        {...(Platform.OS === 'web' && { cursor: savingInviteEmail ? 'not-allowed' : 'pointer' })}
                      >
                        {savingInviteEmail ? (
                          <ActivityIndicator size="small" color="#475569" />
                        ) : (
                          <Text style={styles.accountOutlineButtonText}>Resend invite</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.accountOutlineButton}
                        onPress={handleSaveEmailAndResend}
                        activeOpacity={0.8}
                        disabled={savingInviteEmail}
                        {...(Platform.OS === 'web' && { cursor: savingInviteEmail ? 'not-allowed' : 'pointer' })}
                      >
                        <Text style={styles.accountOutlineButtonText}>Change email</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.connectedLine}>
                      {email ? `✓ Connected · ${email}` : 'Tutor account connected'}
                    </Text>
                    <Text style={styles.connectedHint}>
                      This tutor can access only the selected children from this section.
                    </Text>
                  </>
                )}
                {showPermissionField ? (
                  <View style={styles.permissionFieldWrap}>
                    <Text style={styles.inputLabel}>Permission level</Text>
                    <View style={styles.permissionPills}>
                      {TUTOR_PROFILE_OPTIONS.map((option) => {
                        const selected = option.id === tutorPermissionProfile;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.permissionPill,
                              selected && styles.permissionPillSelected,
                              !permissionEditable && styles.permissionPillDisabled,
                            ]}
                            onPress={() => setTutorPermissionProfile(option.id)}
                            disabled={!permissionEditable}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: permissionEditable ? 'pointer' : 'not-allowed' })}
                          >
                            <Text style={[styles.permissionPillText, selected && styles.permissionPillTextSelected]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {isPendingInvite && !isNewTutor ? (
                      <Text style={styles.permissionHelpText}>Permission level becomes editable after acceptance.</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {!isNewTutor ? (
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
                    {isPendingInvite ? (
                      <Text style={styles.dangerHint}>
                        Pending tutor invites can be updated by changing the email and resending above.
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.dangerHint}>
                          Remove all child access for this tutor. This does not delete their account.
                        </Text>
                        <TouchableOpacity
                          style={styles.dangerButton}
                          onPress={handleRemoveAllAccess}
                          disabled={isSaving}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' && { cursor: isSaving ? 'not-allowed' : 'pointer' })}
                        >
                          <Text style={styles.dangerButtonText}>
                            {isSaving ? 'Removing access...' : 'Remove all access'}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
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
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
  },
  sectionCard: {
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionRule: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  permissionFieldWrap: {
    marginTop: 12,
  },
  permissionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  permissionPillSelected: {
    borderColor: '#9ECFFB',
    backgroundColor: 'rgba(158, 207, 251, 0.22)',
  },
  permissionPillText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  permissionPillTextSelected: {
    color: '#1e5f8a',
  },
  permissionPillDisabled: {
    opacity: 0.55,
  },
  permissionHelpText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  childList: {
    gap: 8,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  childRowText: {
    fontSize: 14,
    color: '#0f172a',
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pendingWait: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  accountButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  accountOutlineButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  accountOutlineButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  connectedLine: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
    lineHeight: 22,
  },
  connectedHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    marginTop: 6,
  },
  dangerZoneAccordion: {
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(254, 242, 242, 0.5)',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  dangerZoneHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#dc2626',
  },
  dangerZoneContent: {
    marginTop: 12,
    gap: 10,
  },
  dangerHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  dangerButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.redBold || '#dc2626',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
