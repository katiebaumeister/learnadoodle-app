import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from './LandingPage';

export default function WebAuthScreen() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { signIn, signUp, resetPassword } = useAuth();
  const pageFadeAnim = useRef(new Animated.Value(1)).current;

  const handleClose = () => {
    Animated.timing(pageFadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setShowWelcome(true);
      // Reset animation for next time
      pageFadeAnim.setValue(1);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({}, '', '/');
      }
    });
  };

  // Reset animation when showing auth screen
  useEffect(() => {
    if (!showWelcome) {
      pageFadeAnim.setValue(1);
    }
  }, [showWelcome, pageFadeAnim]);

  // Helper to update URL without reload
  const updateURL = (view) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (view) {
        url.searchParams.set('view', view);
      } else {
        url.searchParams.delete('view');
      }
      window.history.pushState({ view }, '', url.toString());
    }
  };

  // Handle browser back/forward buttons
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const view = urlParams.get('view');
      
      if (view === 'signup') {
        setShowWelcome(false);
        setIsSignUp(true);
        setIsResetPassword(false);
      } else if (view === 'signin') {
        setShowWelcome(false);
        setIsSignUp(false);
        setIsResetPassword(false);
      } else if (view === 'reset') {
        setShowWelcome(false);
        setIsResetPassword(true);
      } else {
        setShowWelcome(true);
        setIsResetPassword(false);
      }
    };

    // Check initial URL state
    handlePopState();

    // Listen for browser navigation
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const validatePassword = (password) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasMinLength = password.length >= 10;
    
    return {
      isValid: hasUpperCase && hasLowerCase && hasDigits && hasMinLength,
      hasUpperCase,
      hasLowerCase,
      hasDigits,
      hasMinLength
    };
  };

  // Check if form is valid for sign up
  const isSignUpFormValid = useMemo(() => {
    if (!isSignUp) return true; // Not relevant for sign in
    if (!email || !password || !confirmPassword) return false;
    const passwordValidation = validatePassword(password);
    return passwordValidation.isValid && password === confirmPassword;
  }, [isSignUp, email, password, confirmPassword]);

  const handleAuth = async () => {
    clearMessages();
    
    if (!email || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (isSignUp) {
      // Check password confirmation
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match');
        return;
      }

      // Check password requirements
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        const missingRequirements = [];
        if (!passwordValidation.hasMinLength) missingRequirements.push('10 characters');
        if (!passwordValidation.hasUpperCase) missingRequirements.push('uppercase letter');
        if (!passwordValidation.hasLowerCase) missingRequirements.push('lowercase letter');
        if (!passwordValidation.hasDigits) missingRequirements.push('number');
        
        setErrorMessage(`Password must contain: ${missingRequirements.join(', ')}`);
        return;
      }
    }

    setLoading(true);

    try {
      const { data, error } = isSignUp 
        ? await signUp(email, password)
        : await signIn(email, password);

      if (error) {
        // Check if error is due to unverified email
        const errorMessage = error.message || '';
        const errorLower = errorMessage.toLowerCase();
        const isEmailNotVerified = 
          errorLower.includes('email not confirmed') ||
          errorLower.includes('email not verified') ||
          errorLower.includes('email address not verified') ||
          errorLower.includes('confirm your email') ||
          errorLower.includes('verification');
        
        if (isEmailNotVerified && !isSignUp) {
          setErrorMessage('Please check your email for verification!');
        } else {
        setErrorMessage(error.message);
        }
      } else if (isSignUp) {
        // Check if user needs email confirmation
        if (data?.user && !data?.session) {
          setSuccessMessage('Account Created! Please check your email and click the confirmation link to verify your account. This may take 5-10 minutes. You can then sign in.');
          setIsSignUp(false); // Switch to sign in mode
        } else {
          // Account created and signed in - redirect to onboarding
          if (typeof window !== 'undefined') {
            window.location.href = '/?signup=true';
          }
        }
      } else {
        setSuccessMessage('Signed in successfully!');
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    clearMessages();
    
    if (!email) {
      setErrorMessage('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      // Include redirectTo URL so users land on the password reset page
      const { error } = await resetPassword(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Success! If an account is associated with the provided email, you will receive an email to reset. If you do not receive an email, please create a new account.');
        setIsResetPassword(false);
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    clearMessages();
  };

  if (isResetPassword) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.authCard}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Enter your email to receive a password reset link</Text>
          
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
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          
          <TouchableOpacity
            style={[styles.authButton, loading && styles.disabledButton]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            <Text style={styles.authButtonText}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setIsResetPassword(false);
              updateURL('signin');
            }}
          >
            <Text style={styles.linkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Show landing page first
  if (showWelcome) {
    return (
      <LandingPage
        onGetStarted={() => {
          setShowWelcome(false);
          setIsSignUp(true);
          updateURL('signup');
        }}
        onLogIn={() => {
          setShowWelcome(false);
          setIsSignUp(false);
          updateURL('signin');
        }}
      />
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: pageFadeAnim }]}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <X size={24} color="#64748b" />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.contentContainer}>
      <View style={styles.authCard}>
        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Hello again!'}</Text>
        <Text style={styles.subtitle}>
          {isSignUp 
            ? 'Sign up to start your learning journey' 
            : 'SIGN IN TO CONTINUE LEARNING'
          }
        </Text>
        
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
          <TextInput
            style={styles.textInput}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        
        <View style={styles.inputGroup}>
          <View style={styles.passwordInputContainer}>
          <TextInput
              style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
              placeholder="Password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} color="#6b7280" />
              ) : (
                <Eye size={20} color="#6b7280" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        
        {isSignUp && (
            <>
          <View style={styles.inputGroup}>
                <View style={styles.passwordInputContainer}>
            <TextInput
                  style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
                  placeholder="Confirm Password"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color="#6b7280" />
                  ) : (
                    <Eye size={20} color="#6b7280" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {isSignUp && (
              <View style={styles.passwordRequirements}>
                <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                <Text style={[styles.requirement, password.length >= 10 && styles.requirementMet]}>
                  • At least 10 characters long
                </Text>
                <Text style={[styles.requirement, /[A-Z]/.test(password) && styles.requirementMet]}>
                  • Contains uppercase letter
                </Text>
                <Text style={[styles.requirement, /[a-z]/.test(password) && styles.requirementMet]}>
                  • Contains lowercase letter
                </Text>
                <Text style={[styles.requirement, /\d/.test(password) && styles.requirementMet]}>
                  • Contains number
                </Text>
                {password && confirmPassword && (
                  <Text style={[styles.requirement, password === confirmPassword && styles.requirementMet]}>
                    • Passwords match
                  </Text>
                )}
          </View>
            )}
          </>
        )}
        
        <TouchableOpacity
          style={[
            styles.authButton, 
            (loading || (isSignUp && !isSignUpFormValid)) && styles.disabledButton
          ]}
          onPress={handleAuth}
          disabled={loading || (isSignUp && !isSignUpFormValid)}
        >
          <Text style={styles.authButtonText}>
            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.linkContainer}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setIsSignUp(!isSignUp);
              resetForm();
              updateURL(isSignUp ? 'signin' : 'signup');
            }}
          >
            <Text style={styles.linkText}>
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
          
          {!isSignUp && (
            <>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  setIsResetPassword(true);
                  updateURL('reset');
                }}
              >
                <Text style={styles.linkText}>Forgot Password</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </View>
    </ScrollView>
      
      {!isSignUp && (
        <View style={styles.termsNoteContainer}>
          <Text style={styles.termsNote}>
            By signing in to Learnadoodle, you agree to our{' '}
            <Text 
              style={styles.termsLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/terms';
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              Terms
            </Text>
            {' '}and{' '}
            <Text 
              style={styles.termsLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/privacy';
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              Privacy Policy
            </Text>
            {' '}.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#60a5fa', // Bright blue background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  welcomeContent: {
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  dogIllustration: {
    width: 350,
    height: 350,
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogImage: {
    width: 350,
    height: 350,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e3a8a', // Dark blue
    textAlign: 'center',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: '#1e40af', // Slightly lighter dark blue
    textAlign: 'center',
    marginBottom: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  getStartedButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  getStartedButtonText: {
    color: '#374151', // Dark gray
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  logInLink: {
    padding: 8,
  },
  logInLinkText: {
    color: '#374151', // Dark gray
    fontSize: 15,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  container: {
    flex: 1,
    backgroundColor: '#E6F4FC',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 100,
    padding: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 60,
    ...Platform.select({
      web: {
        minHeight: '100vh',
      },
      default: {
        minHeight: '100%',
      },
    }),
  },
  authCard: {
    padding: 32,
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  authButton: {
    backgroundColor: '#60a5fa', // Blue button to match theme
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  authButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  linkContainer: {
    alignItems: 'center',
    gap: 12,
  },
  linkButton: {
    padding: 8,
  },
  linkText: {
    color: '#6b7280',
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
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
    width: '100%',
  },
  studentHint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  termsNoteContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    width: '100%',
    ...(Platform.OS === 'web' && {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    }),
  },
  termsNote: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termsLink: {
    color: '#60a5fa',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  passwordInputContainer: {
    position: 'relative',
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
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  passwordRequirements: {
    marginBottom: 20,
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
});
