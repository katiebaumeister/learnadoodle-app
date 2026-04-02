/**
 * User Controls — parent-facing: what linked learners (children) and tutors are allowed to do.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Switch, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';
import {
  saveFamilyUserControls,
} from '../../lib/services/userControlsClient';
import { useFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

const BORDER = '#E5E7EB';
const ACCENT_ON = '#AECBFA';

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

  const renderPermissionsCard = (title) => (
    <View style={[styles.card, saving && styles.cardSaving]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {saving ? (
          <Text style={styles.savingHint}>Saving…</Text>
        ) : null}
      </View>
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
            trackColor={{ false: BORDER, true: ACCENT_ON }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={BORDER}
          />
        </View>
      ))}
    </View>
  );

  const renderInviteCard = (title, text, buttonLabel) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.inviteCardText}>{text}</Text>
      <TouchableOpacity
        style={styles.inviteButton}
        onPress={buttonLabel === 'Invite child' ? onInviteChildPress : onInviteTutorPress}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={styles.inviteButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Controls</Text>
      <Text style={styles.lead}>Choose what invited children and tutors can do in your family.</Text>
      <Text style={styles.helperText}>
        When a permission is off, learners and tutors can still view content they already have access to - they just
        cannot add or change items in that area.
      </Text>

      {contextLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent || '#4F46E5'} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : null}

      <View style={styles.sections}>
        {showEmptyState ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Invite a child or tutor to manage permissions</Text>
            <Text style={styles.emptyText}>
              User controls appear once a child or tutor has been invited to your family.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={onInviteChildPress}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteButtonText}>Invite child</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={onInviteTutorPress}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteButtonText}>Invite tutor</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showChildControls
          ? renderPermissionsCard('Child Permissions')
          : null}
        {showChildInviteCard
          ? renderInviteCard(
              'Child Permissions',
              'Invite a child to set permissions for student accounts.',
              'Invite child'
            )
          : null}
        {showTutorControls
          ? renderPermissionsCard('Tutor Permissions')
          : null}
        {showTutorInviteCard
          ? renderInviteCard(
              'Tutor Permissions',
              'Invite a tutor to set permissions for tutor accounts.',
              'Invite tutor'
            )
          : null}
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
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  lead: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helperText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 24,
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
    gap: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardSaving: {
    opacity: 0.92,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  savingHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
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
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
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
  inviteCardText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 4,
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
    fontSize: 15,
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
