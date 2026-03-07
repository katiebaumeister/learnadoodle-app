import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const hasSpecialCharRe = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/;

export default function SetPasswordPage() {
  const [userEmail, setUserEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    const establishSessionAndEmail = async () => {
      try {
        if (typeof window === 'undefined') return;

        const hash = window.location.hash?.substring(1) || '';
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        const isSignupConfirm = type === 'signup' || type === 'email';

        if (accessToken && isSignupConfirm) {
          const { data: setData, error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (!mounted) return;
          if (setErr) {
            setErrorMessage(setErr.message || 'Invalid or expired link.');
            setCheckingSession(false);
            return;
          }
          if (setData?.user?.email) {
            setUserEmail(setData.user.email);
            const cleanUrl = window.location.origin + '/set-password';
            window.history.replaceState({}, document.title || '', cleanUrl);
          }
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!mounted) return;
          if (session?.user?.email) {
            setUserEmail(session.user.email);
          } else {
            window.location.href = '/';
            return;
          }
        }
      } catch (e) {
        if (mounted) setErrorMessage(e?.message || 'Something went wrong.');
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    establishSessionAndEmail();
    return () => { mounted = false; };
  }, []);

  const validatePassword = (password) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasSpecialChar = hasSpecialCharRe.test(password);
    const hasMinLength = password.length >= 10;
    return {
      isValid: hasUpperCase && hasLowerCase && hasDigits && hasSpecialChar && hasMinLength,
      hasUpperCase,
      hasLowerCase,
      hasDigits,
      hasSpecialChar,
      hasMinLength,
    };
  };

  const isFormValid = useMemo(() => {
    if (!newPassword || !confirmPassword) return false;
    const p = validatePassword(newPassword);
    return p.isValid && newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const handleSubmit = async () => {
    setErrorMessage('');
    if (!newPassword || !confirmPassword) {
      setErrorMessage('Please fill in both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    const p = validatePassword(newPassword);
    if (!p.isValid) {
      const missing = [];
      if (!p.hasMinLength) missing.push('at least 10 characters');
      if (!p.hasUpperCase) missing.push('1 uppercase letter');
      if (!p.hasLowerCase) missing.push('1 lowercase letter');
      if (!p.hasDigits) missing.push('1 number');
      if (!p.hasSpecialChar) missing.push('1 special character');
      setErrorMessage(`Please include: ${missing.join(', ')}.`);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMessage(error.message || 'Failed to set password.');
        return;
      }
      setSuccessMessage('Password set! Redirecting you to your home page...');
      const homeUrl = window.location.origin + '/home';
      window.history.replaceState({}, document.title || '', homeUrl);
      setTimeout(() => {
        window.location.href = homeUrl;
      }, 1200);
    } catch (e) {
      setErrorMessage(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>Setting up your account...</Text>
          <Text style={styles.subtitle}>Please wait.</Text>
        </View>
      </ScrollView>
    );
  }

  if (!userEmail) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>Invalid or expired link</Text>
          <Text style={styles.subtitle}>Please request a new sign up link from the sign up page.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => { window.location.href = '/'; }}>
            <Text style={styles.primaryButtonText}>Go to home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.card}>
        <Text style={styles.title}>Hello again!</Text>
        <Text style={styles.subtitle}>Sign in to continue learning. Create your password below.</Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.textInput, styles.readOnlyInput]}
            value={userEmail}
            editable={false}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Create new password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={20} color="#6b7280" /> : <Eye size={20} color="#6b7280" />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <EyeOff size={20} color="#6b7280" /> : <Eye size={20} color="#6b7280" />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.requirements}>
          <Text style={styles.requirementsTitle}>Password requirements</Text>
          <Text style={[styles.requirement, newPassword.length >= 10 && styles.requirementMet]}>• At least 10 characters long</Text>
          <Text style={[styles.requirement, /[A-Z]/.test(newPassword) && styles.requirementMet]}>• Contains uppercase letter</Text>
          <Text style={[styles.requirement, /[a-z]/.test(newPassword) && styles.requirementMet]}>• Contains lowercase letter</Text>
          <Text style={[styles.requirement, /\d/.test(newPassword) && styles.requirementMet]}>• Contains number</Text>
          <Text style={[styles.requirement, hasSpecialCharRe.test(newPassword) && styles.requirementMet]}>• Contains special character</Text>
          {newPassword && confirmPassword && (
            <Text style={[styles.requirement, newPassword === confirmPassword && styles.requirementMet]}>• Passwords match</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (loading || !isFormValid) && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading || !isFormValid}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Setting password…' : 'Create password & sign in'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => { window.location.href = '/'; }}>
          <Text style={styles.linkButtonText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E6F4FC',
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 450,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#374151',
    backgroundColor: '#fff',
  },
  readOnlyInput: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 48,
    fontSize: 16,
    color: '#374151',
    backgroundColor: '#fff',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  requirements: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  requirement: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  requirementMet: {
    color: '#16a34a',
  },
  primaryButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    padding: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#38B6FF',
    fontSize: 14,
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
});
