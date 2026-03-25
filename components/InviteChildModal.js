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
import { X, Send, Check, RotateCw } from 'lucide-react';
import { inviteTutor } from '../lib/apiClient';
import { useToast } from './Toast';
import { sourceForChild } from './ui/ChildAvatarCluster';
import { supabase } from '../lib/supabase';
import {
  fetchChildInviteSummaries,
  mergeChildInviteSummary,
  formatInviteLastSent,
  linkedSummariesFromFamilyApiMembers,
  mergeChildInviteSummaryMaps,
} from '../lib/services/childInviteStatus';
import { LEARNADOODLE_LIGHT_BLUE } from '../theme/comingSoonModalTheme';

/** Slightly deeper blue for links/icons on white (pairs with LEARNADOODLE_LIGHT_BLUE) */
const LD_BLUE_ACCENT = '#4A9FD4';

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
  prefillChildId = null,
  onPrefillConsumed,
  /** From GET /api/family/members — fills linked status when Supabase RLS hides rows */
  familyMembersFromApi = null,
}) {
  const toast = useToast();
  const emailInputRef = useRef(null);
  const [summaries, setSummaries] = useState({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [email, setEmail] = useState('');
  const [emailDirty, setEmailDirty] = useState(false);
  const [error, setError] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [emailFocused, setEmailFocused] = useState(false);

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
    setSummariesLoading(true);
    try {
      const map = await fetchChildInviteSummaries(
        supabase,
        familyId,
        list.map((c) => c.id)
      );
      setSummaries(map);
    } catch (_) {
      setSummaries({});
    } finally {
      setSummariesLoading(false);
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
    const apiLinked = linkedSummariesFromFamilyApiMembers(
      familyMembersFromApi,
      list.map((c) => c.id)
    );
    return mergeChildInviteSummaryMaps(summaries, apiLinked);
  }, [summaries, familyMembersFromApi, list]);

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
    setEmailDirty(false);
    setError(null);
  }, []);

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
            <Text style={styles.descMuted}>Add a child profile first, then you can send an invite.</Text>
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
                  <Text style={styles.successLead}>They’ll get an email to join.</Text>
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
                    const st = child.invite_status || 'none';
                    const lastSent = formatInviteLastSent(child.invite_sent_at);
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
                        {st === 'accepted' ? (
                          <Text style={styles.miniCardMeta} numberOfLines={2}>
                            ✓ Joined
                            {child.invite_email ? ` • ${child.invite_email}` : ''}
                          </Text>
                        ) : st === 'pending' ? (
                          <>
                            <Text style={styles.miniCardMeta} numberOfLines={2}>
                              invited • {child.invite_email || '—'}
                            </Text>
                            {lastSent ? (
                              <Text style={styles.miniCardLastSent}>last sent {lastSent}</Text>
                            ) : null}
                            <TouchableOpacity
                              style={styles.miniCardResend}
                              onPress={() => {
                                selectChild(child.id);
                                setEmailDirty(false);
                                setTimeout(() => {
                                  try {
                                    emailInputRef.current?.focus?.();
                                  } catch (_) {}
                                }, 50);
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <RotateCw size={12} color={LD_BLUE_ACCENT} />
                              <Text style={styles.miniCardResendText}>Resend</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text style={styles.miniCardMeta}>Not invited</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {summariesLoading ? (
                  <Text style={styles.loadingHint}>Loading status…</Text>
                ) : null}
              </View>

              {!successInfo && selectedChild ? (
                isAccepted ? (
                  <View style={styles.linkedSection}>
                    <Text style={styles.linkedLine}>
                      ✓ Linked{selectedChild.invite_email ? ` • ${selectedChild.invite_email}` : ''}
                    </Text>
                    <Text style={styles.linkedSub}>
                      This child already has an account. No invite needed.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emailSection}>
                    <Text style={styles.emailLabel}>Email</Text>
                    <TextInput
                      ref={emailInputRef}
                      style={[
                        styles.inputPrimary,
                        emailFocused && styles.inputPrimaryFocused,
                      ]}
                      placeholder="Enter email address"
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
                      <Text style={styles.inviteNote}>Invite already sent — you can edit the email if needed.</Text>
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
  loadingHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
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
    borderColor: LEARNADOODLE_LIGHT_BLUE,
    backgroundColor: 'rgba(158, 207, 251, 0.22)',
  },
  miniCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
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
    color: '#1e5f8a',
  },
  miniCardMeta: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  miniCardLastSent: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  miniCardResend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  miniCardResendText: {
    fontSize: 12,
    fontWeight: '600',
    color: LD_BLUE_ACCENT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  linkedSection: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  linkedLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  linkedSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emailSection: {
    marginBottom: 8,
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
