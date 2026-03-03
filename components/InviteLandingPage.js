import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { previewInvite } from '../lib/apiClient';
import { getAppBase } from '../lib/apiClient';
import { Mail, AlertCircle, UserPlus } from 'lucide-react';

/**
 * Public invite landing page at learnadoodle.com/invites/:token.
 * Shows: "Your parent, [name], invited you to join their family on Learnadoodle.
 * Click to enter your personalized [child/parent/tutor] experience."
 * CTA sends user to app to sign in or create account (with their own email), then accept invite.
 */
export default function InviteLandingPage({ token }) {
  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await previewInvite(token);
        if (cancelled) return;
        if (err || !data) {
          setError(err?.message || 'Invalid or expired invite link');
          return;
        }
        setInviteData(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load invite');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const inviterLabel = inviteData?.role === 'child' ? 'parent' : 'family member';

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#887DEE" />
          <Text style={styles.loadingText}>Loading your invitation...</Text>
        </View>
      </View>
    );
  }

  if (error && !inviteData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Invite link invalid or expired</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => (window.location.href = getAppBase() || '/')}>
            <Text style={styles.buttonText}>Go to Learnadoodle</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>learnadoodle</Text>
          <Text style={styles.title}>You're invited</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.message}>
            {inviteData?.inviter_name ? (
              <>Your {inviterLabel}, <Text style={styles.highlight}>{inviteData.inviter_name}</Text>, invited you to join their family on Learnadoodle.</>
            ) : (
              <>You've been invited to join a family on Learnadoodle.</>
            )}
          </Text>
        </View>

        <View style={styles.emailNote}>
          <Mail size={20} color="#6b7280" />
          <Text style={styles.emailNoteText}>
            You'll need to sign in or create an account with your own email to join this family.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => {
            const appBase = getAppBase() || '';
            const base = appBase.replace(/\/$/, '');
            const emailParam = inviteData?.email ? `&email=${encodeURIComponent(inviteData.email)}` : '';
            window.location.href = `${base}/?view=signup${emailParam}`;
          }}
          activeOpacity={0.8}
        >
          <UserPlus size={20} color="#ffffff" />
          <Text style={styles.signUpButtonText}>Continue with sign up</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          This invitation was sent to {inviteData?.email || 'you'}. Expires in 30 days.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 48,
  },
  content: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brand: {
    fontSize: 28,
    fontWeight: '600',
    color: '#60a5fa',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  message: {
    fontSize: 17,
    lineHeight: 26,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 12,
  },
  highlight: {
    fontWeight: '700',
    color: '#1f2937',
  },
  emailNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 28,
    width: '100%',
  },
  emailNoteText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  signUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#60a5fa',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 260,
    marginTop: 8,
  },
  signUpButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  footer: {
    marginTop: 24,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#887DEE',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
