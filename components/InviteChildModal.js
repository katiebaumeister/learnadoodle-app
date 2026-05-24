import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { X, Send, Check, AlertTriangle } from 'lucide-react';
import { inviteTutor } from '../lib/apiClient';
import { useToast } from './Toast';
import { sourceForChild } from './ui/ChildAvatarCluster';
import { supabase } from '../lib/supabase';
import {
  fetchChildInviteSummaries,
  mergeChildInviteSummary,
  linkedSummariesFromFamilyApiMembers,
  mergeChildInviteSummaryMaps,
  mergeServerChildInviteSummaries,
} from '../lib/services/childInviteStatus';
import { LEARNADOODLE_LIGHT_BLUE } from '../theme/comingSoonModalTheme';
import { DEFAULT_CHILD_PROFILE, normalizeChildProfile } from '../lib/permissions/userPermissionProfiles';

const CHILD_PERMISSION_OPTIONS = [
  {
    id: 'guided',
    label: 'Guided',
    summary: 'Best for close support, with parent-approved actions and extra prompts.',
  },
  {
    id: 'standard',
    label: 'Standard',
    summary: 'Balanced access so your child can work independently with sensible guardrails.',
  },
  {
    id: 'independent',
    label: 'Independent',
    summary: 'Most autonomy, allowing your child to manage work with minimal restrictions.',
  },
];

function isValidEmail(value) {
  const t = (value || '').trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function childDisplayName(child) {
  if (!child) return 'this child';
  return child.name || child.first_name || 'Child';
}

/**
 * Invite-by-email flow for children; opens from home (WebLayout) or Family.
 */
export default function InviteChildModal({
  visible,
  onClose,
  familyId,
  familyChildren = [],
  onInvited,
  onOpenUserControls,
  prefillChildId = null,
  onPrefillConsumed,
  /** From GET /api/family/members — fills linked status when Supabase RLS hides rows */
  familyMembersFromApi = null,
  /** From GET /api/family/members — pending/accepted per child (service role; fixes RLS on invites) */
  childInviteSummariesFromApi = null,
}) {
  const toast = useToast();
  const emailInputRef = useRef(null);
  const [summaries, setSummaries] = useState({});
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [email, setEmail] = useState('');
  const [emailDirty, setEmailDirty] = useState(false);
  const [error, setError] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [childPermissionProfile, setChildPermissionProfile] = useState(DEFAULT_CHILD_PROFILE);

  const list = useMemo(
    () => (familyChildren || []).filter((c) => c && c.id != null && !c.archived),
    [familyChildren]
  );

  const childKey = useMemo(() => list.map((c) => String(c.id)).join(','), [list]);

  const reloadSummaries = useCallback(async () => {
    if (!familyId || list.length === 0) {
      setSummaries({});
      return;
    }
    try {
      const map = await fetchChildInviteSummaries(
        supabase,
        familyId,
        list.map((c) => c.id)
      );
      setSummaries(map);
    } catch (_) {
      setSummaries({});
    }
  }, [familyId, list]);

  useEffect(() => {
    if (!visible) return;
    reloadSummaries();
  }, [visible, childKey, reloadSummaries]);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSuccessInfo(null);
    setEmailFocused(false);
    setEmailDirty(false);
    setEmail('');
    if (list.length === 1) {
      setSelectedChildId(list[0].id);
    } else {
      setSelectedChildId(null);
    }
    setChildPermissionProfile(DEFAULT_CHILD_PROFILE);
  }, [visible, childKey, list.length]);

  useEffect(() => {
    if (!visible || !prefillChildId) return;
    const match = list.find((c) => String(c.id) === String(prefillChildId));
    if (match) {
      setSelectedChildId(match.id);
      onPrefillConsumed?.();
    }
  }, [visible, prefillChildId, list, onPrefillConsumed]);

  const summariesWithApi = useMemo(() => {
    const rawIds = list.map((c) => c.id);
    const apiLinked = linkedSummariesFromFamilyApiMembers(familyMembersFromApi, rawIds);
    const merged = mergeChildInviteSummaryMaps(summaries, apiLinked);
    return mergeServerChildInviteSummaries(merged, childInviteSummariesFromApi, rawIds);
  }, [summaries, familyMembersFromApi, childInviteSummariesFromApi, list]);

  const mergedList = useMemo(
    () =>
      list.map((c) =>
        mergeChildInviteSummary(c, summariesWithApi[String(c.id)])
      ),
    [list, summariesWithApi]
  );

  const selectedChild = useMemo(
    () => mergedList.find((c) => String(c.id) === String(selectedChildId)) || null,
    [mergedList, selectedChildId]
  );

  const selectedStatus = selectedChild?.invite_status || 'none';
  const isAccepted = selectedStatus === 'accepted';
  const isPending = selectedStatus === 'pending';

  useEffect(() => {
    if (!visible || emailDirty) return;
    const c = mergedList.find((x) => String(x.id) === String(selectedChildId));
    if (!c) return;
    const st = c.invite_status || 'none';
    if (st === 'accepted' || st === 'pending') setEmail(c.invite_email || '');
    else setEmail('');
  }, [visible, selectedChildId, mergedList, emailDirty]);

  const selectChild = useCallback((childId) => {
    setSelectedChildId(childId);
    const matched = mergedList.find((child) => String(child?.id) === String(childId));
    const preset = matched?.permission_profile || DEFAULT_CHILD_PROFILE;
    setChildPermissionProfile(normalizeChildProfile(preset));
    setEmailDirty(false);
    setError(null);
  }, [mergedList]);

  const emailOk = isValidEmail(email);
  const canSend =
    list.length > 0 &&
    selectedChildId != null &&
    !isAccepted &&
    emailOk &&
    !inviting &&
    !successInfo &&
    !!familyId;

  const primaryLabel = isPending ? 'Resend Invite' : 'Send Invite';

  const resetAndClose = useCallback(() => {
    setSelectedChildId(null);
    setEmail('');
    setEmailDirty(false);
    setError(null);
    setSuccessInfo(null);
    onClose?.();
  }, [onClose]);

  const handleSend = async () => {
    if (!emailOk) {
      setError('Enter a valid email address.');
      return;
    }
    if (!selectedChildId || isAccepted) {
      return;
    }
    if (!familyId) {
      setError('Family not loaded. Please try again.');
      return;
    }

    const wasResend = isPending;
    setInviting(true);
    setError(null);
    try {
      const { error: err } = await inviteTutor({
        email: email.trim(),
        role: 'child',
        child_ids: [selectedChildId],
        child_permission_profile: normalizeChildProfile(childPermissionProfile),
      });
      if (err) throw err;
      const name = childDisplayName(selectedChild);
      setEmailDirty(false);
      setEmail('');
      setSuccessInfo({ name, resent: wasResend });
      await reloadSummaries();
      onInvited?.();
    } catch (err) {
      setError(err.message || 'Failed to invite child');
      toast.push('Failed to invite child', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleInviteAnother = useCallback(() => {
    setSuccessInfo(null);
    setError(null);
    if (Platform.OS === 'web' && emailInputRef.current) {
      setTimeout(() => {
        try {
          emailInputRef.current?.focus?.();
        } catch (_) {}
      }, 100);
    }
  }, []);

  const handleOpenUserControls = useCallback(() => {
    if (typeof onOpenUserControls === 'function') {
      onOpenUserControls();
    }
    resetAndClose();
  }, [onOpenUserControls, resetAndClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={resetAndClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Invite a child</Text>
            <TouchableOpacity
              onPress={resetAndClose}
              style={styles.closeBtn}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              accessibilityLabel="Close"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {list.length === 0 ? (
            <Text style={styles.descMuted}>Add a child profile first, then send their invite when you're ready.</Text>
          ) : (
            <>
              {successInfo ? (
                <View style={styles.successBlock}>
                  <View style={styles.successIconWrap}>
                    <Check size={22} color="#059669" strokeWidth={2.5} />
                  </View>
                  <View style={styles.successTitleRow}>
                    {selectedChild ? (
                      <Image
                        source={sourceForChild(selectedChild)}
                        style={styles.successAvatar}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.successTitle}>
                      {successInfo.resent ? 'Invite resent to ' : 'Invite sent to '}
                      {successInfo.name}
                    </Text>
                  </View>
                  <Text style={styles.successLead}>They’ll receive an email with a simple link to join.</Text>
                  {typeof onOpenUserControls === 'function' ? (
                    <TouchableOpacity
                      style={styles.successInlineLinkButton}
                      onPress={handleOpenUserControls}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.successInlineLinkText}>Manage invites in Family Members</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>Child</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {mergedList.map((child) => {
                    const selected = String(child.id) === String(selectedChildId);
                    const name = childDisplayName(child);
                    return (
                      <TouchableOpacity
                        key={String(child.id)}
                        style={[styles.miniCard, selected && styles.miniCardSelected]}
                        onPress={() => selectChild(child.id)}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        activeOpacity={0.85}
                      >
                        <View style={styles.miniCardTop}>
                          <Image
                            source={sourceForChild(child)}
                            style={styles.miniCardAvatar}
                            resizeMode="cover"
                          />
                          <Text
                            style={[styles.miniCardName, selected && styles.miniCardNameSelected]}
                            numberOfLines={1}
                          >
                            {name}
                            {selected ? ' ●' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {!successInfo && selectedChild ? (
                isAccepted ? (
                  <View style={styles.alreadyConnectedBox}>
                    <View style={styles.alreadyConnectedTitleRow}>
                      <AlertTriangle size={18} color="#b45309" />
                      <Text style={styles.alreadyConnectedTitle}>This child is already connected</Text>
                    </View>
                    <Text style={styles.alreadyConnectedBody}>
                      To change email access, go to Family → Family Members and open Edit for this child.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emailSection}>
                    <Text style={styles.emailLabel}>Permission level for this child</Text>
                    <View style={styles.permissionPills}>
                      {CHILD_PERMISSION_OPTIONS.map((option) => {
                        const selected = option.id === childPermissionProfile;
                        return (
                          <View key={option.id} style={styles.permissionOptionWrap}>
                            <TouchableOpacity
                              style={[
                                styles.permissionPill,
                                selected && styles.permissionPillSelected,
                                inviting && styles.permissionPillDisabled,
                              ]}
                              onPress={() => setChildPermissionProfile(option.id)}
                              disabled={inviting}
                              activeOpacity={0.85}
                              {...(Platform.OS === 'web' && { cursor: inviting ? 'not-allowed' : 'pointer' })}
                            >
                              <Text style={[styles.permissionPillText, selected && styles.permissionPillTextSelected]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                            <Text style={styles.permissionPillSummary}>
                              {option.summary}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={styles.emailLabel}>Child email</Text>
                    <TextInput
                      ref={emailInputRef}
                      style={[
                        styles.inputPrimary,
                        emailFocused && styles.inputPrimaryFocused,
                      ]}
                      placeholder="name@example.com"
                      placeholderTextColor="#9ca3af"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        setEmailDirty(true);
                        if (error) setError(null);
                      }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!inviting}
                    />
                    {isPending ? (
                      <Text style={styles.inviteNote}>Invite already sent. You can update the email and resend anytime.</Text>
                    ) : null}
                  </View>
                )
              ) : null}

              {error ? <Text style={styles.err}>{error}</Text> : null}

              {successInfo ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={handleInviteAnother}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.btnSecondaryText}>Invite another</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnPrimaryStrong}
                    onPress={resetAndClose}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.btnPrimaryStrongText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={resetAndClose}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.btnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  {!isAccepted ? (
                    <TouchableOpacity
                      style={[styles.btnPrimaryStrong, !canSend && styles.btnPrimaryStrongDisabled]}
                      onPress={handleSend}
                      disabled={!canSend}
                      {...(Platform.OS === 'web' && {
                        cursor: canSend ? 'pointer' : 'not-allowed',
                      })}
                    >
                      {inviting ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Send size={16} color="#ffffff" />
                          <Text style={styles.btnPrimaryStrongText}>{primaryLabel}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  sheet: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 480,
    padding: 28,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  descMuted: {
    fontSize: 14,
    color: '#94a3b8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  successBlock: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    padding: 18,
    marginBottom: 20,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  successAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d1fae5',
    borderWidth: 2,
    borderColor: '#a7f3d0',
    ...(Platform.OS === 'web' && { objectFit: 'cover' }),
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#065f46',
    textAlign: 'center',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  successLead: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  successInlineLinkButton: {
    marginTop: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  successInlineLinkText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectorSection: {
    marginBottom: 14,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 8,
    paddingBottom: 4,
  },
  miniCard: {
    width: 168,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  miniCardSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
  },
  miniCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniCardAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    ...(Platform.OS === 'web' && { objectFit: 'cover' }),
  },
  miniCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  miniCardNameSelected: {
    color: '#6BB3E8',
  },
  alreadyConnectedBox: {
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  alreadyConnectedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  alreadyConnectedTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  alreadyConnectedBody: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emailSection: {
    marginBottom: 8,
  },
  permissionPills: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  permissionOptionWrap: {
    gap: 4,
    alignItems: 'flex-start',
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
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
  },
  permissionPillText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  permissionPillTextSelected: {
    color: '#6BB3E8',
  },
  permissionPillDisabled: {
    opacity: 0.55,
  },
  permissionPillSummary: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontStyle: 'italic',
    }),
  },
  emailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteNote: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputPrimary: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  inputPrimaryFocused: {
    borderColor: LEARNADOODLE_LIGHT_BLUE,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 0 0 3px rgba(158, 207, 251, 0.55)',
    }),
  },
  err: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 8,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 20,
    flexWrap: 'wrap',
  },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  btnSecondaryText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  btnPrimaryStrong: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: LEARNADOODLE_LIGHT_BLUE,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 132,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 12px rgba(158, 207, 251, 0.55)',
      cursor: 'pointer',
    }),
  },
  btnPrimaryStrongDisabled: {
    backgroundColor: '#d1d5db',
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
      cursor: 'not-allowed',
    }),
  },
  btnPrimaryStrongText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
