/**
 * User Controls — parent-facing: what linked learners (children) and tutors are allowed to do.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Switch, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';
import {
  saveFamilyUserControls,
} from '../../lib/services/userControlsClient';
import { useFamilyUserControls } from '../../contexts/FamilyUserControlsContext';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';

const SWITCH_TRACK_OFF = '#d1d5db';
const SWITCH_TRACK_ON = LEARNADOODLE_LIGHT_BLUE;
const SWITCH_THUMB_OFF = '#94A3B8';
const SWITCH_THUMB_ON = '#0D9488';

const CONTROL_ROWS = [
  {
    id: 'events',
    label: 'Add / edit events',
    description: 'Create and change planner events for themselves or their scope.',
  },
  {
    id: 'subjects',
    label: 'Add / edit subjects',
    description: 'Create and edit subjects and course organization.',
  },
  {
    id: 'child_profile',
    label: 'Add / edit own child profile',
    description: 'Update profile details for their learner account (name, grade, support, etc.).',
  },
  {
    id: 'materials',
    label: 'Add / edit materials',
    description: 'Add or edit library materials and attachments.',
  },
  {
    id: 'plans',
    label: 'Add / edit plans',
    description: 'Create or edit plan years and plan-linked scheduling.',
  },
  {
    id: 'planning_preferences',
    label: 'Change planning preferences',
    description: 'Adjust default planning targets, holidays, breaks, and related preferences.',
  },
];

export default function UserControlsSettingsContent({
  familyId: propFamilyId,
  familyMembers = [],
  children = [],
  childInviteSummaries = {},
  onInviteChildPress,
  onInviteTutorPress,
}) {
  const toast = useToast();
  const {
    familyId: ctxFamilyId,
    flags: contextFlags,
    loading: contextLoading,
    error: contextError,
    refresh,
  } = useFamilyUserControls();
  const familyId = propFamilyId || ctxFamilyId;

  const [flags, setFlags] = useState(contextFlags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFlags(contextFlags);
  }, [contextFlags]);

  useEffect(() => {
    if (contextError) {
      toast.push(contextError, 'error');
    }
  }, [contextError, toast]);

  const toggle = useCallback(
    async (id) => {
      if (!familyId) {
        toast.push('Family not loaded yet.', 'error');
        return;
      }
      const next = { ...flags, [id]: !flags[id] };
      setFlags(next);
      setSaving(true);
      try {
        const { error } = await saveFamilyUserControls(familyId, next);
        if (error) throw error;
        await refresh();
      } catch (e) {
        setFlags((f) => ({ ...f, [id]: !f[id] }));
        toast.push(e?.message || 'Could not save', 'error');
      } finally {
        setSaving(false);
      }
    },
    [familyId, flags, refresh, toast]
  );

  const invitedChildCount = useMemo(
    () =>
      (children || []).filter((child) => {
        const summary = childInviteSummaries?.[String(child.id)];
        const status = summary?.invite_status;
        return status === 'pending' || status === 'accepted';
      }).length,
    [childInviteSummaries, children]
  );
  const invitedTutorCount = useMemo(
    () =>
      (familyMembers || []).filter((member) => {
        const role = member?.member_role || member?.role;
        return role === 'tutor';
      }).length,
    [familyMembers]
  );
  const showChildControls = invitedChildCount > 0;
  const showTutorControls = invitedTutorCount > 0;
  const showEmptyState = !showChildControls && !showTutorControls;
  const showChildInviteCard = !showEmptyState && !showChildControls;
  const showTutorInviteCard = !showEmptyState && !showTutorControls;

  const renderPermissionsSection = (title) => (
    <View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {saving ? <Text style={styles.savingHint}>Saving…</Text> : null}
      </View>
      <View style={styles.subsectionDivider} />
      {title === 'Child Permissions' ? (
        <Text style={styles.permissionExplainer}>
          When a permission is off, learners and tutors can still view content they already have access to - they just
          cannot add or change items in that area.
        </Text>
      ) : null}
      {CONTROL_ROWS.map((row, index) => (
        <View
          key={`${title}-${row.id}`}
          style={[styles.row, index < CONTROL_ROWS.length - 1 && styles.rowBorder]}
        >
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowDescription}>{row.description}</Text>
          </View>
          <Switch
            value={!!flags[row.id]}
            onValueChange={() => toggle(row.id)}
            disabled={contextLoading || saving || !familyId}
            trackColor={{ false: SWITCH_TRACK_OFF, true: SWITCH_TRACK_ON }}
            thumbColor={flags[row.id] ? SWITCH_THUMB_ON : SWITCH_THUMB_OFF}
            ios_backgroundColor={SWITCH_TRACK_OFF}
          />
        </View>
      ))}
    </View>
  );

  const renderInviteSection = (title, text, buttonLabel) => (
    <View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={buttonLabel === 'Invite child' ? onInviteChildPress : onInviteTutorPress}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={16} color="#374151" />
          <Text style={styles.inviteButtonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.subsectionDivider} />
      <Text style={styles.inviteSectionText}>{text}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Controls</Text>

      {contextLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent || '#4F46E5'} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : null}

      <View style={styles.sections}>
        {showEmptyState ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Invite a child or tutor to manage permissions</Text>
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
            {renderPermissionsSection('Child Permissions')}
          </View>
        ) : null}
        {showChildInviteCard ? (
          <View style={[styles.sectionBlock, styles.sectionBlockFirst]}>
            {renderInviteSection(
              'Child Permissions',
              'Invite a child to set permissions for student accounts.',
              'Invite Child'
            )}
          </View>
        ) : null}
        {showTutorControls ? (
          <View style={styles.sectionBlock}>{renderPermissionsSection('Tutor Permissions')}</View>
        ) : null}
        {showTutorInviteCard ? (
          <View style={styles.sectionBlock}>
            {renderInviteSection(
              'Tutor Permissions',
              'Invite a tutor to set permissions for tutor accounts.',
              'Invite Tutor'
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionBlock: {
    marginTop: 28,
  },
  sectionBlockFirst: {
    marginTop: 0,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
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
    marginBottom: 20,
  },
  permissionExplainer: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
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
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inviteButtonAlignStart: {
    alignSelf: 'flex-start',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
