/**
 * User Controls — parent-facing: what linked learners (children) and tutors are allowed to do.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Image } from 'react-native';
import { Plus, RotateCw } from 'lucide-react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import {
  getFamilyUserControlsSettings,
  updateFamilyUserControlsSettings,
} from '../../lib/services/userControlsClient';
import { useFamilyUserControls } from '../../contexts/FamilyUserControlsContext';
import {
  DEFAULT_CHILD_PROFILE,
  DEFAULT_TUTOR_PROFILE,
  normalizeChildProfile,
  normalizeTutorProfile,
} from '../../lib/permissions/userPermissionProfiles';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { formatInviteLastSent } from '../../lib/services/childInviteStatus';

const CHILD_PROFILES = [
  {
    id: 'guided',
    title: 'Guided',
  },
  {
    id: 'standard',
    title: 'Standard',
  },
  {
    id: 'independent',
    title: 'Independent Learning',
  },
];

const TUTOR_PROFILES = [
  {
    id: 'viewer',
    title: 'Viewer Tutor',
  },
  {
    id: 'teaching',
    title: 'Teaching Tutor',
  },
  {
    id: 'manager',
    title: 'Lead Tutor',
  },
];

const WEB_SELECT_STYLE = {
  borderRadius: 10,
  borderColor: '#d1d5db',
  borderWidth: 1,
  backgroundColor: '#ffffff',
  color: '#111827',
  fontSize: 14,
  paddingHorizontal: 10,
  paddingVertical: 8,
  maxWidth: 300,
};

const USER_CONTROLS_CACHE_PREFIX = 'ld.familyUserControlsSettings.';
const userControlsSettingsMemoryCache = new Map();

function normalizeSettingsPayload(data) {
  return {
    childDefaultProfile: normalizeChildProfile(data?.childDefaultProfile || DEFAULT_CHILD_PROFILE),
    children: Array.isArray(data?.children)
      ? data.children.map((child) => ({
          ...child,
          permission_profile: normalizeChildProfile(child?.permission_profile),
        }))
      : [],
    tutors: Array.isArray(data?.tutors)
      ? data.tutors.map((tutor) => ({
          ...tutor,
          tutor_permission_profile: normalizeTutorProfile(tutor?.tutor_permission_profile || DEFAULT_TUTOR_PROFILE),
        }))
      : [],
    pendingTutorInvites: Array.isArray(data?.pendingTutorInvites)
      ? data.pendingTutorInvites.map((invite) => ({
          id: String(invite?.id || ''),
          name: invite?.name || null,
          email: invite?.email || null,
          sent_at: invite?.sent_at || null,
        }))
      : [],
  };
}

function getCachedUserControlsSettings(familyId) {
  const key = String(familyId || '').trim();
  if (!key) return null;
  const memoryHit = userControlsSettingsMemoryCache.get(key);
  if (memoryHit) return normalizeSettingsPayload(memoryHit);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${USER_CONTROLS_CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const normalized = normalizeSettingsPayload(parsed);
      userControlsSettingsMemoryCache.set(key, normalized);
      return normalized;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function setCachedUserControlsSettings(familyId, settings) {
  const key = String(familyId || '').trim();
  if (!key || !settings) return;
  const normalized = normalizeSettingsPayload(settings);
  userControlsSettingsMemoryCache.set(key, normalized);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${USER_CONTROLS_CACHE_PREFIX}${key}`, JSON.stringify(normalized));
    } catch (_) {
      // ignore storage write failures
    }
  }
}

export default function UserControlsSettingsContent({
  familyId: propFamilyId,
  children = [],
  onInviteChildPress,
  onInviteTutorPress,
}) {
  const toast = useToast();
  const {
    familyId: ctxFamilyId,
    loading: contextLoading,
    error: contextError,
    refresh,
  } = useFamilyUserControls();
  const familyId = propFamilyId || ctxFamilyId;
  const initialCachedSettings = useMemo(() => getCachedUserControlsSettings(familyId), [familyId]);

  const [settings, setSettings] = useState(initialCachedSettings);
  const [selectedTutorId, setSelectedTutorId] = useState(initialCachedSettings?.tutors?.[0]?.id || null);
  const [saving, setSaving] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(!!initialCachedSettings);
  const [confirmDialog, setConfirmDialog] = useState({
    visible: false,
    title: 'Save setting change?',
    message: '',
    confirmLabel: 'Save change',
  });
  const confirmActionRef = useRef(null);

  useEffect(() => {
    if (contextError) {
      toast.push(contextError, 'error');
    }
  }, [contextError, toast]);

  const loadSettings = useCallback(async () => {
    if (!familyId) return;
    const { data, error } = await getFamilyUserControlsSettings();
    if (error) throw error;
    const next = normalizeSettingsPayload(data);
    setCachedUserControlsSettings(familyId, next);
    setSettings(next);
    setSelectedTutorId((prev) => {
      if (prev && next.tutors.some((t) => t.id === prev)) return prev;
      return next.tutors[0]?.id || null;
    });
  }, [familyId]);

  useEffect(() => {
    let mounted = true;
    if (!familyId) {
      setSettings(null);
      setSelectedTutorId(null);
      setHasLoadedSettings(false);
      return undefined;
    }
    const cached = getCachedUserControlsSettings(familyId);
    if (cached) {
      setSettings(cached);
      setHasLoadedSettings(true);
      setSelectedTutorId((prev) => {
        if (prev && cached.tutors.some((t) => t.id === prev)) return prev;
        return cached.tutors[0]?.id || null;
      });
    } else {
      setSettings(null);
      setSelectedTutorId(null);
      setHasLoadedSettings(false);
    }
    (async () => {
      try {
        await loadSettings();
        if (mounted) setHasLoadedSettings(true);
      } catch (e) {
        if (mounted) {
          toast.push(e?.message || 'Could not load user controls', 'error');
          setHasLoadedSettings(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [familyId, loadSettings, toast]);

  useEffect(() => {
    if (!familyId || !settings) return;
    setCachedUserControlsSettings(familyId, settings);
  }, [familyId, settings]);

  const savePatch = useCallback(
    async (patch, optimisticUpdater) => {
      if (!familyId) {
        toast.push('Family not loaded yet.', 'error');
        return;
      }
      const previous = settings;
      if (typeof optimisticUpdater === 'function') {
        setSettings((current) => optimisticUpdater(current));
      }
      setSaving(true);
      try {
        const { error } = await updateFamilyUserControlsSettings(patch);
        if (error) throw error;
        await Promise.all([loadSettings(), refresh()]);
      } catch (e) {
        setSettings(previous);
        toast.push(e?.message || 'Could not save', 'error');
      } finally {
        setSaving(false);
      }
    },
    [familyId, loadSettings, refresh, settings, toast]
  );

  const resolvedSettings = settings || {
    childDefaultProfile: DEFAULT_CHILD_PROFILE,
    children: [],
    tutors: [],
    pendingTutorInvites: [],
  };

  const selectedTutor = useMemo(
    () =>
      resolvedSettings.tutors.find((tutor) => tutor.id === selectedTutorId) ||
      resolvedSettings.tutors[0] ||
      null,
    [resolvedSettings.tutors, selectedTutorId]
  );
  const childById = useMemo(() => {
    const map = new Map();
    (Array.isArray(children) ? children : []).forEach((child) => {
      const id = String(child?.id || '').trim();
      if (id) map.set(id, child);
    });
    return map;
  }, [children]);

  const showChildControls = resolvedSettings.children.length > 0;
  const showTutorControls = resolvedSettings.tutors.length > 0;
  const showPendingTutorInvites = (resolvedSettings.pendingTutorInvites || []).length > 0;
  const showEmptyState = hasLoadedSettings && !showChildControls && !showTutorControls && !showPendingTutorInvites;
  const showHeaderInviteButtons = hasLoadedSettings && !showEmptyState;

  const requestSettingConfirmation = useCallback(({ title, message, confirmLabel = 'Save change', onConfirm }) => {
    confirmActionRef.current = typeof onConfirm === 'function' ? onConfirm : null;
    setConfirmDialog({
      visible: true,
      title: title || 'Save setting change?',
      message: message || 'Apply this permission change?',
      confirmLabel,
    });
  }, []);

  const cancelSettingConfirmation = useCallback(() => {
    confirmActionRef.current = null;
    setConfirmDialog((prev) => ({ ...prev, visible: false }));
  }, []);

  const applySettingConfirmation = useCallback(() => {
    const apply = confirmActionRef.current;
    confirmActionRef.current = null;
    setConfirmDialog((prev) => ({ ...prev, visible: false }));
    if (typeof apply === 'function') apply();
  }, []);

  const handleChildRowSelect = useCallback(
    (childId, profileId) => {
      const normalized = normalizeChildProfile(profileId);
      const currentChild = resolvedSettings.children.find((child) => child.id === childId);
      if (!currentChild || currentChild.permission_profile === normalized) return;
      const target = CHILD_PROFILES.find((profile) => profile.id === normalized);
      requestSettingConfirmation({
        title: 'Save learner permission change?',
        message: `Set ${currentChild.name || 'this learner'} to ${target?.title || 'this mode'}?`,
        onConfirm: () =>
          savePatch(
            { childProfiles: [{ childId, permission_profile: normalized }] },
            (current) => ({
              ...current,
              children: current.children.map((child) =>
                child.id === childId ? { ...child, permission_profile: normalized } : child
              ),
            })
          ),
      });
    },
    [requestSettingConfirmation, resolvedSettings.children, savePatch]
  );

  const handleTutorSelect = useCallback(
    (memberId, profileId) => {
      const normalized = normalizeTutorProfile(profileId);
      const currentTutor = resolvedSettings.tutors.find((tutor) => tutor.id === memberId);
      if (!currentTutor || currentTutor.tutor_permission_profile === normalized) return;
      const target = TUTOR_PROFILES.find((profile) => profile.id === normalized);
      requestSettingConfirmation({
        title: 'Save tutor permission change?',
        message: `Set ${currentTutor.name || currentTutor.email || 'this tutor'} to ${target?.title || 'this mode'}?`,
        onConfirm: () =>
          savePatch(
            { tutorProfiles: [{ memberId, tutor_permission_profile: normalized }] },
            (current) => ({
              ...current,
              tutors: current.tutors.map((tutor) =>
                tutor.id === memberId ? { ...tutor, tutor_permission_profile: normalized } : tutor
              ),
            })
          ),
      });
    },
    [requestSettingConfirmation, resolvedSettings.tutors, savePatch]
  );

  const renderCompactProfileSelect = (options, value, onChange) => {
    if (Platform.OS === 'web') {
      return (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={styles.compactSelect}
          disabled={contextLoading || saving || !hasLoadedSettings}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      );
    }
    return renderModePills(options, value, onChange);
  };

  const renderModePills = (options, value, onChange) => (
    <View style={styles.modePills}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.modePill, selected && styles.modePillSelected]}
            onPress={() => onChange(option.id)}
            disabled={contextLoading || saving || !hasLoadedSettings}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.modePillText, selected && styles.modePillTextSelected]}>{option.title}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Controls</Text>

      <View style={styles.sections}>
        {showEmptyState ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Invite a child or tutor to set user controls</Text>
            <Text style={styles.emptyText}>
              User controls appear once a child or tutor has been invited to your family.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={[styles.inviteButton, styles.inviteButtonAlignStart]}
                onPress={onInviteChildPress}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#374151" />
                <Text style={styles.inviteButtonText}>Invite child</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteButton, styles.inviteButtonAlignStart]}
                onPress={onInviteTutorPress}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#374151" />
                <Text style={styles.inviteButtonText}>Invite tutor</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showChildControls ? (
          <View style={[styles.sectionBlock, styles.sectionBlockFirst]}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Child Permissions</Text>
              <View style={styles.sectionHeaderActions}>
                {saving ? <Text style={styles.savingHint}>Saving...</Text> : null}
                {showHeaderInviteButtons ? (
                  <TouchableOpacity
                    style={styles.inviteButton}
                    onPress={onInviteChildPress}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Plus size={16} color="#374151" />
                    <Text style={styles.inviteButtonText}>Invite child</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <View style={styles.subsectionDivider} />
            <View style={styles.memberList}>
              {resolvedSettings.children.map((child, index) => (
                <View key={child.id} style={[styles.memberRow, index > 0 && styles.memberRowBorder]}>
                  <View style={styles.memberIdentityRow}>
                    <View style={styles.memberAvatarWrap}>
                      <Image
                        source={sourceForChild(childById.get(String(child.id)))}
                        style={styles.memberAvatar}
                        resizeMode="cover"
                      />
                    </View>
                    <Text style={styles.memberName}>{child.name}</Text>
                  </View>
                  {renderCompactProfileSelect(CHILD_PROFILES, child.permission_profile, (value) =>
                    handleChildRowSelect(child.id, value)
                  )}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {showTutorControls ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Tutor Permissions</Text>
              {showHeaderInviteButtons ? (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => onInviteTutorPress?.('')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.inviteButtonText}>Invite tutor</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.subsectionDivider} />
            <View style={styles.tutorCallout}>
              <Text style={styles.tutorCalloutLabel}>Assigned educator access</Text>
              <Text style={styles.tutorCalloutCopy}>
                Tutors only access assigned learners, schedules, and materials.
              </Text>
            </View>

            {resolvedSettings.tutors.length > 1 && selectedTutor ? (
              <View style={styles.defaultRow}>
                <Text style={styles.defaultLabel}>Editing tutor mode for</Text>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedTutor.id}
                    onChange={(event) => setSelectedTutorId(event.target.value)}
                    style={WEB_SELECT_STYLE}
                    disabled={contextLoading || saving}
                  >
                    {resolvedSettings.tutors.map((tutor) => (
                      <option key={tutor.id} value={tutor.id}>
                        {tutor.name || tutor.email || 'Tutor'}
                      </option>
                    ))}
                  </select>
                ) : null}
              </View>
            ) : null}

            <View style={styles.memberList}>
              {resolvedSettings.tutors.map((tutor, index) => (
                <View key={tutor.id} style={[styles.memberRow, index > 0 && styles.memberRowBorder]}>
                  <Text style={styles.memberName}>{tutor.name || tutor.email || 'Tutor'}</Text>
                  {renderModePills(TUTOR_PROFILES, tutor.tutor_permission_profile, (value) =>
                    handleTutorSelect(tutor.id, value)
                  )}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!showTutorControls && hasLoadedSettings ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Tutor Permissions</Text>
              {showHeaderInviteButtons ? (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => onInviteTutorPress?.('')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.inviteButtonText}>Invite tutor</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.subsectionDivider} />
            {showPendingTutorInvites ? (
              <View style={styles.memberList}>
                {resolvedSettings.pendingTutorInvites.map((invite, index) => (
                  <View key={invite.id || String(index)} style={[styles.memberRow, index > 0 && styles.memberRowBorder]}>
                    <View style={styles.memberRowChildNameRow}>
                      <Text style={styles.memberName}>{invite.name || invite.email || 'Tutor invite'}</Text>
                      <View style={[styles.inviteStatusPill, styles.inviteStatusPillPending]}>
                        <Text style={[styles.inviteStatusPillText, styles.inviteStatusPillTextPending]}>Pending invite</Text>
                      </View>
                    </View>
                    {formatInviteLastSent(invite.sent_at) ? (
                      <Text style={styles.pendingInviteMeta}>Last sent · {formatInviteLastSent(invite.sent_at)}</Text>
                    ) : null}
                    <Text style={styles.pendingInviteWait}>Waiting for acceptance</Text>
                    <TouchableOpacity
                      style={styles.memberRowResend}
                      onPress={() => onInviteTutorPress?.(invite.email || '')}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <RotateCw size={12} color="#6366F1" />
                      <Text style={styles.memberRowResendText}>Resend</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.sectionEmptySubtitle}>No tutors yet</Text>
            )}
          </View>
        ) : null}

        {!showChildControls && hasLoadedSettings ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Child Permissions</Text>
              {showHeaderInviteButtons ? (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={onInviteChildPress}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.inviteButtonText}>Invite child</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.subsectionDivider} />
            <Text style={styles.sectionEmptySubtitle}>No children yet</Text>
          </View>
        ) : null}

      </View>
      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Cancel"
        onConfirm={applySettingConfirmation}
        onCancel={cancelSettingConfirmation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionBlock: {
    marginTop: 28,
  },
  sectionBlockFirst: {
    marginTop: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subsectionDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  sections: {
    width: '100%',
  },
  savingHint: {
    fontSize: 12,
    color: '#6b7280',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    width: '100%',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionEmptySubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    flexShrink: 0,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  inviteButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteSectionText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteButtonAlignStart: {
    alignSelf: 'flex-start',
  },
  subsectionIntro: {
    marginBottom: 10,
  },
  subsectionIntroSecondary: {
    marginTop: 16,
    marginBottom: 8,
  },
  subsectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subsectionCopy: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  defaultRow: {
    marginTop: 0,
  },
  defaultLabel: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 8,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tutorCallout: {
    marginBottom: 12,
  },
  tutorCalloutLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#4338ca',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tutorCalloutCopy: {
    marginTop: 2,
    fontSize: 13,
    color: '#4b5563',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  memberList: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  memberRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  memberIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#e5e7eb',
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    ...(Platform.OS === 'web' && { objectFit: 'cover' }),
  },
  memberRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  compactSelect: {
    borderRadius: 10,
    borderColor: '#d1d5db',
    borderWidth: 1,
    backgroundColor: '#f8fafc',
    color: '#111827',
    fontSize: 13,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minWidth: 160,
    maxWidth: 220,
  },
  modePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  modePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  modePillSelected: {
    borderColor: '#38bdf8',
    backgroundColor: '#f0f9ff',
  },
  modePillText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modePillTextSelected: {
    color: '#0f172a',
  },
  pendingInviteText: {
    fontSize: 12,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  memberRowChildNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  inviteStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  inviteStatusPillPending: {
    backgroundColor: '#fef3c7',
  },
  inviteStatusPillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteStatusPillTextPending: {
    color: '#b45309',
  },
  pendingInviteMeta: {
    fontSize: 12,
    color: '#9ca3af',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pendingInviteWait: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  memberRowResend: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  memberRowResendText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
