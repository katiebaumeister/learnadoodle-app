import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function PasswordResetPage({ onPasswordResetComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasResetTokens, setHasResetTokens] = useState(false);

  useEffect(() => {
    // Check if we're on a password reset page
    const checkPasswordReset = async () => {
      try {
        // Check URL for reset tokens
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const hasAccessToken = urlParams.has('access_token') || hashParams.has('access_token');
        const hasRefreshToken = urlParams.has('refresh_token') || hashParams.has('refresh_token');
        const isRecoveryType = urlParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
        
        if (hasAccessToken || hasRefreshToken || isRecoveryType) {
          setHasResetTokens(true);
          console.log('Password reset tokens detected');
        }
      } catch (error) {
        console.error('Error in password reset check:', error);
      }
    };

    checkPasswordReset();

    // Cleanup function to clear reset flow when component unmounts
    return () => {
      if (onPasswordResetComplete) {
        onPasswordResetComplete();
      }
    };
  }, [onPasswordResetComplete]);

  const validatePassword = (password) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    return {
      isValid: hasUpperCase && hasLowerCase && hasDigits && hasSymbols,
      hasUpperCase,
      hasLowerCase,
      hasDigits,
      hasSymbols
    };
  };

  const handlePasswordReset = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    // Debug: Log the current URL to see what tokens we have
    if (typeof window !== 'undefined') {
      console.log('Current URL:', window.location.href);
      console.log('URL Hash:', window.location.hash);
      console.log('URL Search:', window.location.search);
    }

    // Validate password
    if (!newPassword || !confirmPassword) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      const missingRequirements = [];
      if (!passwordValidation.hasUpperCase) missingRequirements.push('uppercase letter');
      if (!passwordValidation.hasLowerCase) missingRequirements.push('lowercase letter');
      if (!passwordValidation.hasDigits) missingRequirements.push('digit');
      if (!passwordValidation.hasSymbols) missingRequirements.push('symbol');
      
      setErrorMessage(`Password must contain at least one: ${missingRequirements.join(', ')}`);
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // For password reset flows, we need to handle this differently
      // The user should be authenticated from the reset link, but might not have a full session
      
      // First, try to get the current session and user
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      console.log('Current session:', session ? 'exists' : 'none');
      console.log('Current user:', currentUser ? 'exists' : 'none');
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        setErrorMessage('Unable to verify your session. Please try requesting a new reset link.');
        setLoading(false);
        return;
      }

      let updateResult;
      
      if ((session && session.user) || currentUser) {
        // We have a valid session or user, update password normally
        console.log('Updating password with existing session/user...');
        updateResult = await supabase.auth.updateUser({
          password: newPassword
        });
      } else {
        // No session yet - this is common in password reset flows
        // We need to wait for the session to be established from the reset tokens
        console.log('No session yet, waiting for reset tokens to establish session...');
        
        // Wait a bit for Supabase to process the reset tokens
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to get session again
        const { data: { session: newSession } } = await supabase.auth.getSession();
        const { data: { user: newUser } } = await supabase.auth.getUser();
        
        console.log('After waiting - Session:', newSession ? 'exists' : 'none', 'User:', newUser ? 'exists' : 'none');
        
        if (newSession && newSession.user) {
          console.log('Session established, updating password...');
          updateResult = await supabase.auth.updateUser({
            password: newPassword
          });
        } else if (newUser) {
          console.log('User exists but no session, updating password...');
          updateResult = await supabase.auth.updateUser({
            password: newPassword
          });
        } else {
          // Still no session - this might be a timing issue
          console.log('Still no session, trying alternative approach...');
          
          // Try to refresh the session first
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError) {
            console.log('Session refresh failed:', refreshError);
          } else if (refreshData.session) {
            console.log('Session refreshed, updating password...');
            updateResult = await supabase.auth.updateUser({
              password: newPassword
            });
          } else {
                      // As a last resort, try to update password directly
          console.log('Trying direct password update as last resort...');
          
          // Try to parse the hash and use the tokens directly
          if (typeof window !== 'undefined' && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            
            if (accessToken) {
              console.log('Found access token in hash, trying to use it...');
              // Try to set the session with the tokens from the hash
              const { data: setSessionData, error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || ''
              });
              
              if (setSessionError) {
                console.log('Failed to set session with tokens:', setSessionError);
              } else if (setSessionData.session) {
                console.log('Session set successfully with tokens, updating password...');
                updateResult = await supabase.auth.updateUser({
                  password: newPassword
                });
              }
            }
          }
          
          // If we still don't have a result, try the direct update
          if (!updateResult) {
            console.log('Trying direct password update...');
            updateResult = await supabase.auth.updateUser({
              password: newPassword
            });
          }
          }
        }
      }

      // Check if we have a result from any of the attempts
      if (!updateResult) {
        console.error('All password update attempts failed - no result returned');
        setErrorMessage('Unable to update password. Your reset link may have expired or is invalid. Please request a new password reset link.');
        return;
      }

      if (updateResult.error) {
        console.error('Password update error:', updateResult.error);
        
        // Provide more helpful error messages
        if (updateResult.error.message.includes('Auth session missing')) {
          setErrorMessage('Your reset link has expired or is invalid. Please request a new password reset link.');
        } else {
          setErrorMessage(updateResult.error.message || 'Failed to update password. Please try again.');
        }
      } else {
        handlePasswordResetSuccess();
      }
    } catch (error) {
      console.error('Password reset exception:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordResetSuccess = () => {
    setSuccessMessage('Password updated successfully! You can now sign in with your new password.');
    
    // Clear the form
    setNewPassword('');
    setConfirmPassword('');
    
    // Clear URL parameters and redirect to login after a short delay
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        // Clear any reset tokens from URL
        const cleanUrl = window.location.origin + '/';
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Notify parent component that password reset is complete
        if (onPasswordResetComplete) {
          onPasswordResetComplete();
        }
        
        // Redirect to main app
        window.location.href = cleanUrl;
      }
    }, 2000);
  };

  // Show loading while checking reset tokens
  if (!hasResetTokens && !errorMessage) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.resetCard}>
          <Text style={styles.title}>Verifying Reset Link...</Text>
          <Text style={styles.subtitle}>
            Please wait while we verify your password reset link.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.resetCard}>
        <Text style={styles.title}>Reset Your Password</Text>
        <Text style={styles.subtitle}>
          Enter your new password below. Make sure it's secure and memorable.
        </Text>
        
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        
        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
            <Text style={styles.successSubtext}>
              Redirecting you to the login page...
            </Text>
          </View>
        ) : null}
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>New Password</Text>
          <TextInput
            style={styles.textInput}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter your new password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <TextInput
            style={styles.textInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm your new password"
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        
        <View style={styles.passwordRequirements}>
          <Text style={styles.requirementsTitle}>Password Requirements:</Text>
          <Text style={styles.requirement}>• At least 6 characters long</Text>
          <Text style={styles.requirement}>• Contains uppercase letter</Text>
          <Text style={styles.requirement}>• Contains lowercase letter</Text>
          <Text style={styles.requirement}>• Contains number</Text>
          <Text style={styles.requirement}>• Contains special character</Text>
        </View>
        
        <TouchableOpacity
          style={[styles.resetButton, loading && styles.disabledButton]}
          onPress={handlePasswordReset}
          disabled={loading}
        >
          <Text style={styles.resetButtonText}>
            {loading ? 'Updating Password...' : 'Update Password'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/';
            }
          }}
        >
          <Text style={styles.backButtonText}>Back to Login</Text>
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
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100vh',
  },
  resetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
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
    marginBottom: 32,
    lineHeight: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
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
    backgroundColor: '#ffffff',
  },
  passwordRequirements: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
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
  resetButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
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
    marginBottom: 24,
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
    marginBottom: 24,
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  successSubtext: {
    color: '#16a34a',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
