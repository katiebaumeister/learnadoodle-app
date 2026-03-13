import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { previewInvite, acceptChildInvite, acceptInviteWithPassword } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * Create-password page for email invite link: /invites/:token/accept.
 * Email is pre-filled from the invite (read-only). User sets password (twice), then we
 * create the account for the invited role/child and redirect to their home.
 */
export default function InviteAcceptPasswordPage({ token }) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Ensure favicon uses root-relative URL so it shows on /invites/xxx/accept
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
        if (!cancelled) setError(err?.message || 'Failed to load invite');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const isChildInvite = inviteData?.role === 'child' && (inviteData?.child_id || (inviteData?.child_scope && inviteData.child_scope.length > 0));
  const copyLinkUrl = typeof window !== 'undefined' ? `${window.location.origin}/invites/${token}` : '';

  /** Human-readable error message; detects "email already exists" for friendly UI. */
  const getDisplayError = (errMessage) => {
    if (!errMessage || typeof errMessage !== 'string') return errMessage || 'Something went wrong.';
    const lower = errMessage.toLowerCase();
    if (lower.includes('email already exists') || lower.includes('already been registered') || lower.includes('email_exists')) {
      return 'An account with this email already exists. Sign in below to use it.';
    }
    return errMessage;
  };

  const isEmailExistsError = (errMessage) => {
    if (!errMessage || typeof errMessage !== 'string') return false;
    const lower = errMessage.toLowerCase();
    return lower.includes('email already exists') || lower.includes('already been registered') || lower.includes('email_exists');
  };

  const validate = () => {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !inviteData?.email) return;
    setAccepting(true);
    setError(null);
    try {
      if (isChildInvite) {
        const { data, error: err } = await acceptChildInvite({
          token,
          email: inviteData.email,
          password,
        });
        if (err || !data?.success) {
          throw new Error(getDisplayError(err?.message || data?.error) || 'Failed to create account');
        }
      } else {
        const { data, error: err } = await acceptInviteWithPassword({
          token,
          email: inviteData.email,
          password,
        });
        if (err || !data?.success) {
          throw new Error(getDisplayError(err?.message || data?.error) || 'Failed to create account');
        }
      }
      try {
        await signIn(inviteData.email, password);
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
      } catch (loginErr) {
        if (typeof window !== 'undefined') {
          window.location.href = `/?email=${encodeURIComponent(inviteData.email)}`;
        }
      }
    } catch (err) {
      setError(getDisplayError(err?.message) || 'Failed to create account');
    } finally {
      setAccepting(false);
    }
  };

  if (loading || !inviteData) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingState]}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading invitation…</Text>
        </View>
      </View>
    );
  }

  if (error && !inviteData) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingState]}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Invite link invalid or expired</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.expiredNote}>Invite links expire in 30 days. If yours has expired, ask the person who invited you to send a new one.</Text>
          <TouchableOpacity style={styles.button} onPress={() => (window.location.href = '/')}>
            <Text style={styles.buttonText}>Go to Learnadoodle</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.content}>
        <Text style={styles.brand}>learnadoodle</Text>
        <View style={styles.card}>
          <Text style={styles.title}>Create your password</Text>
          {inviteData.child_name && (
            <Text style={styles.subtitle}>Welcome, {inviteData.child_name}</Text>
          )}
          <Text style={styles.hint}>Your account will use the email this invitation was sent to.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.readOnlyField}>
              <Mail size={18} color="#6b7280" />
              <Text style={styles.readOnlyText}>{inviteData.email}</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              placeholder="Type password again"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={18} color="#ef4444" />
              <View style={styles.errorContent}>
                <Text style={styles.errorText}>{error}</Text>
                {isEmailExistsError(error) && (
                  <TouchableOpacity
                    style={styles.signInLink}
                    onPress={() => {
                      const params = inviteData?.email ? `?email=${encodeURIComponent(inviteData.email)}` : '';
                      window.location.href = `/${params}`;
                    }}
                  >
                    <Text style={styles.signInLinkText}>Sign in to your account</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryButton, accepting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={accepting}
          >
            {accepting ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.primaryButtonText}>Creating account…</Text>
              </>
            ) : (
              <>
                <CheckCircle size={20} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Create account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1, paddingTop: 96, paddingBottom: 48 },
  content: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  loadingState: { paddingTop: 96 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  brand: {
    fontSize: 28,
    fontWeight: '600',
    color: '#60a5fa',
    marginBottom: 24,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, sans-serif' }),
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
  title: { fontSize: 20, fontWeight: '600', color: '#1f2937', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#60a5fa', marginBottom: 8, textAlign: 'center' },
  hint: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8 },
  message: { fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 16 },
  copyLabel: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  copyUrl: { fontSize: 12, color: '#6b7280', marginBottom: 16, wordBreak: 'break-all' },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  readOnlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  readOnlyText: { fontSize: 16, color: '#6b7280' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorContent: { flex: 1 },
  errorText: { fontSize: 14, color: '#dc2626', marginBottom: 4 },
  signInLink: { marginTop: 8, alignSelf: 'flex-start' },
  signInLinkText: { fontSize: 14, fontWeight: '600', color: '#2563eb', textDecorationLine: 'underline' },
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: '#ef4444', marginTop: 16, textAlign: 'center' },
  expiredNote: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 12, marginBottom: 20, paddingHorizontal: 16 },
  button: {
    backgroundColor: '#60a5fa',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  buttonDisabled: { opacity: 0.7 },
});
