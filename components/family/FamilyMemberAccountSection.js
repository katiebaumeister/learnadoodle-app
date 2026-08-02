import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { designTokens } from '../../theme/designTokens';

/**
 * Account / invite block for guest parents and tutors (mirrors EditChildModal account section).
 */
export default function FamilyMemberAccountSection({
  roleLabel = 'parent',
  inviteStatus = 'none',
  connectedEmail = null,
  pendingEmail = null,
  onSendInvite,
  inviting = false,
  disabled = false,
  autoOpenInvite = false,
}) {
  const [email, setEmail] = useState(pendingEmail || '');
  const [showInviteForm, setShowInviteForm] = useState(Boolean(autoOpenInvite));

  useEffect(() => {
    if (pendingEmail) setEmail(pendingEmail);
  }, [pendingEmail, inviteStatus]);

  useEffect(() => {
    if (autoOpenInvite) setShowInviteForm(true);
  }, [autoOpenInvite]);

  const label = roleLabel === 'tutor' ? 'tutor' : 'parent';
  const inviteCta = roleLabel === 'tutor' ? 'Invite tutor' : 'Invite parent';

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed || inviting || disabled) return;
    await onSendInvite?.(trimmed);
  };

  if (inviteStatus === 'connected') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.rule} />
        <Text style={styles.connectedLine}>
          {connectedEmail ? `✓ Connected · ${connectedEmail}` : '✓ Connected'}
        </Text>
      </View>
    );
  }

  if (inviteStatus === 'pending') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.rule} />
        <Text style={styles.pendingTitle}>Invite sent</Text>
        <TextInput
          style={styles.fieldInput}
          value={email}
          onChangeText={setEmail}
          placeholder={`${label}@email.com`}
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          editable={!inviting && !disabled}
        />
        <Text style={styles.pendingWait}>Waiting for acceptance</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={handleSend}
            disabled={inviting || disabled || !email.trim()}
            {...(Platform.OS === 'web' && { cursor: inviting ? 'not-allowed' : 'pointer' })}
          >
            {inviting ? (
              <ActivityIndicator size="small" color="#475569" />
            ) : (
              <Text style={styles.outlineButtonText}>Resend invite</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.rule} />
      <Text style={styles.emptyText}>No account connected</Text>
      <Text style={styles.purposeLine}>
        Invite this {label} to sign in and access your family.
      </Text>
      {showInviteForm ? (
        <>
          <TextInput
            style={styles.fieldInput}
            value={email}
            onChangeText={setEmail}
            placeholder={`${label}@email.com`}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!inviting && !disabled}
          />
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={handleSend}
              disabled={inviting || disabled || !email.trim()}
              {...(Platform.OS === 'web' && { cursor: inviting ? 'not-allowed' : 'pointer' })}
            >
              {inviting ? (
                <ActivityIndicator size="small" color={designTokens.colors.primary} />
              ) : (
                <Text style={styles.inviteButtonText}>Send invite</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={() => setShowInviteForm(true)}
          disabled={disabled}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.inviteButtonText}>{inviteCta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
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
  rule: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 14,
  },
  connectedLine: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
    lineHeight: 22,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  pendingWait: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  purposeLine: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 14,
  },
  fieldInput: {
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    width: '100%',
    marginBottom: 8,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  outlineButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  outlineButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  inviteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: designTokens.colors.primary,
    backgroundColor: designTokens.softAccents.core,
    marginTop: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: designTokens.colors.primary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
