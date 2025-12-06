import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { UserPlus, Mail, Lock, User, CheckCircle, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { acceptChildInvite, previewChildInvite } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Toast';

/**
 * ChildInvitePage
 * Child registration page for accepting invites
 */
export default function ChildInvitePage({ token, onComplete }) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState(null);
  
  // Form fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const toast = useToast();

  useEffect(() => {
    loadInvitePreview();
  }, [token]);

  const loadInvitePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await previewChildInvite(token);
      if (err || !data) {
        setError(err?.message || 'Failed to load invite');
        return;
      }
      setInviteData(data);
      // Pre-fill email with child name if available
      if (data.child_name) {
        const suggestedEmail = `${data.child_name.toLowerCase().replace(/\s+/g, '')}@family.local`;
        setEmail(suggestedEmail);
      }
    } catch (err) {
      setError(err.message || 'Failed to load invite');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!username.trim()) {
      setError('Username is required');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Valid email is required');
      return false;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleAccept = async () => {
    if (!validateForm()) return;

    setAccepting(true);
    setError(null);

    try {
      const { data, error: err } = await acceptChildInvite({
        token,
        username: username.trim(),
        email: email.trim(),
        password,
      });

      if (err || !data?.success) {
        throw new Error(err?.message || data?.error || 'Failed to create account');
      }

      // Auto-login after account creation
      try {
        await signIn(email.trim(), password);
        toast.push('Account created! Welcome!', 'success');
        
        if (onComplete) {
          onComplete(data);
        } else {
          // Redirect to child dashboard
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }
      } catch (loginError) {
        // Account created but login failed - redirect to login
        toast.push('Account created! Please sign in.', 'success');
        if (typeof window !== 'undefined') {
          window.location.href = '/?email=' + encodeURIComponent(email.trim());
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading invite...</Text>
        </View>
      </View>
    );
  }

  if (error && !inviteData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Invite Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
          >
            <Text style={styles.buttonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <UserPlus size={48} color={colors.accent} />
          <Text style={styles.title}>Create Your Account</Text>
          {inviteData?.child_name && (
            <Text style={styles.subtitle}>Welcome, {inviteData.child_name}!</Text>
          )}
        </View>

        {inviteData && (
          <View style={styles.inviteInfo}>
            {inviteData.family_name && (
              <Text style={styles.familyName}>{inviteData.family_name} Family</Text>
            )}
            <Text style={styles.inviteDescription}>
              You've been invited to log in and see your own learning dashboard!
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <AlertCircle size={20} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <User size={16} color={colors.muted} />
              <Text style={styles.label}>Username</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Choose a username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Mail size={16} color={colors.muted} />
              <Text style={styles.label}>Email</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="your.email@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Lock size={16} color={colors.muted} />
              <Text style={styles.label}>Password</Text>
            </View>
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
            <View style={styles.fieldHeader}>
              <Lock size={16} color={colors.muted} />
              <Text style={styles.label}>Confirm Password</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Enter password again"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.acceptButton, accepting && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.buttonText}>Creating Account...</Text>
            </>
          ) : (
            <>
              <CheckCircle size={20} color="#ffffff" />
              <Text style={styles.buttonText}>Create Account</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: colors.accent,
    marginTop: 8,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  inviteInfo: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  familyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  inviteDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    flex: 1,
  },
  form: {
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

