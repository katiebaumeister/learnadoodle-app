import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import AppLoader from './AppLoader';
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

  // Ensure favicon uses root-relative URL so it shows on /invites/xxx (not just /)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('/favicon.png')) {
      link.setAttribute('href', '/favicon.png');
    }
  }, []);

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

  if (error && !inviteData) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingState]}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Invite link invalid or expired</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.footer}>Invite links expire in 30 days. If yours has expired, ask the person who invited you to send a new one.</Text>
          <TouchableOpacity style={styles.button} onPress={() => (window.location.href = getAppBase() || '/')}>
            <Text style={styles.buttonText}>Go to Learnadoodle</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Don't show any content until invite is loaded (same loader as landing: white + light blue spinner + learnadoodle)
  if (loading || !inviteData) {
    return (
      <View style={styles.container}>
        <AppLoader />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>learnadoodle</Text>
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
            This invitation was sent to {inviteData?.email || 'you'}. Click below to set your password and join—no extra email will be sent.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => {
            const appBase = getAppBase() || '';
            const base = appBase.replace(/\/$/, '');
            window.location.href = `${base}/invites/${token}/accept`;
          }}
          activeOpacity={0.8}
        >
          <UserPlus size={20} color="#ffffff" />
          <Text style={styles.signUpButtonText}>Accept invitation</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInLink}
          onPress={() => {
            const appBase = getAppBase() || '';
            const base = appBase.replace(/\/$/, '');
            const emailParam = inviteData?.email ? `?email=${encodeURIComponent(inviteData.email)}` : '';
            window.location.href = `${base}/${emailParam}`;
          }}
        >
          <Text style={styles.signInLinkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Invite links expire in 30 days. If yours has expired, ask the person who invited you to send a new one.
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
    paddingTop: 96,
    paddingBottom: 48,
  },
  content: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  loadingState: {
    paddingTop: 96,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
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
  signInLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  signInLinkText: {
    fontSize: 15,
    color: '#60a5fa',
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 24,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
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
