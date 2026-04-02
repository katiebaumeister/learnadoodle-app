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
import { Eye, EyeOff, X, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAPIBase } from '../lib/apiClient';
import { auth as supabaseAuth } from '../lib/supabase';
import LandingPage from './LandingPage';

const googleLogo = require('../assets/google.png');

function formatConfirmationSentAt(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const date = d.getDate();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${day}, ${month} ${date} at ${time}`;
  } catch (_) {
    return isoString;
  }
}

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
  const [existingEmailOfferReset, setExistingEmailOfferReset] = useState(false);
  const [showAccountCreatedConfirmation, setShowAccountCreatedConfirmation] = useState(false);
  const [verifyEmailForConfirmation, setVerifyEmailForConfirmation] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendFeedback, setResendFeedback] = useState('');
  const [justClosedModal, setJustClosedModal] = useState(false);

  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const isExistingEmailError = (msg) => {
    if (!msg || typeof msg !== 'string') return false;
    const lower = msg.toLowerCase();
    return lower.includes('already registered') || lower.includes('already been registered') ||
      lower.includes('email already exists') || lower.includes('user already exists') || lower.includes('email_exists');
  };
  const pageFadeAnim = useRef(new Animated.Value(1)).current;

  const handleClose = () => {
    setJustClosedModal(true);
    Animated.timing(pageFadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setShowWelcome(true);
      pageFadeAnim.setValue(1);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({}, '', '/');
      }
    });
  };

  // Reset animation when showing auth screen
  useEffect(() => {
    if (!showWelcome) {
      // Fade in animation when auth screen appears
      pageFadeAnim.setValue(0);
      Animated.timing(pageFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [showWelcome, pageFadeAnim]);

  // Clear justClosedModal after landing has rendered (so next close can set it again)
  useEffect(() => {
    if (showWelcome && justClosedModal) {
      const t = setTimeout(() => setJustClosedModal(false), 100);
      return () => clearTimeout(t);
    }
  }, [showWelcome, justClosedModal]);

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

  // Handle browser back/forward buttons and pre-fill email from URL (e.g. from invite landing ?view=signup&email=...)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const view = urlParams.get('view');
      const emailParam = urlParams.get('email');

      if (emailParam) {
        try {
          setEmail(decodeURIComponent(emailParam).trim());
        } catch (_) {
          setEmail(emailParam.trim());
        }
      }

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

  // While waiting for email confirmation, poll for session (e.g. user verified in another tab).
  useEffect(() => {
    if (!showAccountCreatedConfirmation || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let cancelled = false;
    const redirectIfSession = async () => {
      try {
        const { data: { session } } = await supabaseAuth.getCurrentSession();
        if (cancelled || !session?.user) return;
        window.location.href = '/?signup=true';
      } catch (_) {}
    };
    redirectIfSession();
    const id = setInterval(redirectIfSession, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showAccountCreatedConfirmation]);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setExistingEmailOfferReset(false);
    setShowAccountCreatedConfirmation(false);
    setVerifyEmailForConfirmation('');
    setResendFeedback('');
  };

  const hasSpecialCharRe = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/;
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
      hasMinLength
    };
  };

  // Check if form is valid for sign up (email-only flow: we send signup link, password is set on /set-password)
  const isSignUpFormValid = useMemo(() => {
    if (!isSignUp) return true;
    return !!email && email.trim().length > 0;
  }, [isSignUp, email]);

  const handleAuth = async () => {
    clearMessages();

    if (isSignUp) {
      if (!email || !email.trim()) {
        setErrorMessage('Please enter your email address');
        return;
      }
    } else {
      if (!email || !password) {
        setErrorMessage('Please fill in email and password');
        return;
      }
    }

    if (isSignUp) {
      // If we already sent a confirmation to this email, show friendly message instead of calling signUp again.
      setLoading(true);
      try {
        const base = getAPIBase();
        const checkRes = await fetch(`${base}/api/auth/signup-confirmation-sent?email=${encodeURIComponent(email.trim())}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.sent_at) {
            const formatted = formatConfirmationSentAt(checkData.sent_at);
            setSuccessMessage(formatted ? `Confirmation sent on ${formatted}. Please check your email!` : 'Confirmation already sent. Please check your email!');
            setLoading(false);
            return;
          }
        }
      } catch (_) {
        // Ignore; proceed with signUp
      } finally {
        setLoading(false);
      }

      // Email-only signup: we send a confirmation link; user sets password on /set-password after confirming.
      // Use canonical domain (learnadoodle.com, no www) to match Supabase Site URL and avoid hash loss on www→non-www redirects.
      const redirectTo = typeof window !== 'undefined' ? (() => {
        const host = window.location.hostname || '';
        const canonical = (host === 'www.learnadoodle.com' || host === 'learnadoodle.com')
          ? 'https://learnadoodle.com'
          : window.location.origin;
        return `${canonical}/set-password`;
      })() : undefined;
      const lower = 'abcdefghijklmnopqrstuvwxyz';
      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const digit = '0123456789';
      const special = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~";
      const all = lower + upper + digit + special;
      const pick = (str, n = 1) => {
        const arr = str.split('');
        for (let i = 0; i < n; i++) {
          const j = typeof crypto !== 'undefined' && crypto.getRandomValues
            ? crypto.getRandomValues(new Uint8Array(1))[0] % arr.length
            : Math.floor(Math.random() * arr.length);
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr.slice(0, n).join('');
      };
      const tempPassword = pick(lower, 1) + pick(upper, 1) + pick(digit, 1) + pick(special, 1) +
        (typeof crypto !== 'undefined' && crypto.getRandomValues
          ? Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b) => all[b % all.length]).join('')
          : Array.from({ length: 20 }, () => all[Math.floor(Math.random() * all.length)]).join(''));
      setLoading(true);
      try {
        const { data, error } = await signUp(email.trim(), tempPassword, { emailRedirectTo: redirectTo });
        if (error) {
          if (isExistingEmailError(error.message)) {
            setErrorMessage('An account with this email already exists.');
            setExistingEmailOfferReset(true);
          } else if (error.status === 500 || (error.message && String(error.message).toLowerCase().includes('500'))) {
            setErrorMessage('We couldn\'t send the confirmation email right now (server error). Please try again in a few minutes or contact contact@learnadoodle.com.');
          } else if (error.code === 'unexpected_failure' || (error.message && String(error.message).toLowerCase().includes('database error saving new user'))) {
            setErrorMessage('We couldn\'t create your account right now (server setup issue). Please try again in a few minutes or contact contact@learnadoodle.com.');
          } else {
            const errMsg = error.message || '';
            const errLower = errMsg.toLowerCase();
            const isEmailNotVerified = errLower.includes('email not confirmed') || errLower.includes('email not verified') || errLower.includes('verification');
            const isPasswordPolicyError = errLower.includes('password should contain') || errLower.includes('at least one character of each');
            setErrorMessage(
              isEmailNotVerified ? 'Please check your email for verification!' :
              isPasswordPolicyError ? 'Unable to send sign-up link. Please try again.' :
              errMsg
            );
          }
          setLoading(false);
          return;
        }
        const existingAccount = data?.user && (!data.user.identities || data.user.identities.length === 0);
        if (existingAccount) {
          setErrorMessage('An account with this email already exists.');
          setExistingEmailOfferReset(true);
          setLoading(false);
          return;
        }
        if (data?.user && !data?.session) {
          setVerifyEmailForConfirmation(email.trim());
          setResendFeedback('');
          setShowAccountCreatedConfirmation(true);
          try {
            const base = getAPIBase();
            await fetch(`${base}/api/auth/signup-confirmation-sent`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.trim() }),
            });
          } catch (_) {}
        } else if (data?.session && typeof window !== 'undefined') {
          window.location.href = '/?signup=true';
        }
      } catch (err) {
        const is500 = err?.status === 500 || (err?.message && String(err.message).toLowerCase().includes('500'));
        const isDbSaveUser = err?.code === 'unexpected_failure' || (err?.message && String(err.message).toLowerCase().includes('database error saving new user'));
        setErrorMessage(
          is500
            ? 'We couldn\'t send the confirmation email right now (server error). Please try again in a few minutes or contact contact@learnadoodle.com.'
            : isDbSaveUser
              ? 'We couldn\'t create your account right now (server setup issue). Please try again in a few minutes or contact contact@learnadoodle.com.'
              : (err?.message || 'An unexpected error occurred.')
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await signIn(email, password);

      if (error) {
        const errorMessage = error.message || '';
        const errorLower = errorMessage.toLowerCase();
        const isEmailNotVerified =
          errorLower.includes('email not confirmed') ||
          errorLower.includes('email not verified') ||
          errorLower.includes('email address not verified') ||
          errorLower.includes('confirm your email') ||
          errorLower.includes('verification');
        setErrorMessage(isEmailNotVerified ? 'Please check your email for verification!' : error.message);
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
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await resetPassword(email, { redirectTo });
      
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Success! If an account is associated with the provided email, you will receive an email to reset. If you do not receive an email, please create a new account.');
        setIsResetPassword(false);
        setExistingEmailOfferReset(false);
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    clearMessages();
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setErrorMessage(error.message || 'Failed to start Google sign in');
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to start Google sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetForExistingEmail = async () => {
    if (!email) return;
    setLoading(true);
    clearMessages();
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await resetPassword(email, { redirectTo });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Password reset link sent! Check your email, then sign in below.');
        setExistingEmailOfferReset(false);
        setIsSignUp(false);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Failed to send reset link.');
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

  const closeResetToSignIn = () => {
    setIsResetPassword(false);
    clearMessages();
    updateURL('signin');
  };

  if (isResetPassword) {
    return (
      <Animated.View style={[styles.container, { opacity: pageFadeAnim }]}>
        {Platform.OS === 'web' && <View style={styles.backgroundPattern} />}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={closeResetToSignIn}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <X size={24} color="#64748b" />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={styles.authCardWrapper}>
            <View style={styles.authCard}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.subtitle}>
                ENTER YOUR EMAIL AND WE&apos;LL SEND YOU A RESET LINK
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
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleResetPassword}
                />
              </View>

              <TouchableOpacity
                style={[styles.authButton, loading && styles.disabledButton]}
                onPress={handleResetPassword}
                disabled={loading}
                {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.authButtonText}>
                  {loading ? 'Sending link…' : 'Send reset link'}
                </Text>
              </TouchableOpacity>

              <View style={styles.linkContainer}>
                <TouchableOpacity style={styles.linkButton} onPress={closeResetToSignIn}>
                  <Text style={styles.linkText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
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
            {' .'}
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (showAccountCreatedConfirmation) {
    const confirmationEmail = verifyEmailForConfirmation || email.trim();

    const closeAccountCreated = () => {
      setJustClosedModal(true);
      Animated.timing(pageFadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        setShowAccountCreatedConfirmation(false);
        setVerifyEmailForConfirmation('');
        setResendFeedback('');
        setShowWelcome(true);
        pageFadeAnim.setValue(1);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.pushState({}, '', '/');
        }
      });
    };

    const checkVerificationAndRedirect = async () => {
      setResendFeedback('');
      try {
        const { data: { session } } = await supabaseAuth.getCurrentSession();
        if (session?.user && typeof window !== 'undefined') {
          window.location.href = '/?signup=true';
          return;
        }
        setResendFeedback('We don’t see a verified session yet. Open the link in your email, then try again.');
      } catch (_) {
        setResendFeedback('Something went wrong checking your status. Please try again.');
      }
    };

    const handleResendConfirmation = async () => {
      const em = confirmationEmail;
      if (!em) return;
      setResendLoading(true);
      setResendFeedback('');
      const { error } = await supabaseAuth.resendSignupEmail(em);
      setResendLoading(false);
      if (error) {
        setResendFeedback(error.message || 'Could not resend right now. Try again in a minute.');
      } else {
        setResendFeedback('Another confirmation email is on its way.');
      }
    };

    const handleChangeEmailFromVerify = () => {
      clearMessages();
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setResendLoading(false);
      setLoading(false);
      setShowWelcome(false);
      setIsSignUp(true);
      setIsResetPassword(false);
      updateURL('signup');
    };

    return (
      <Animated.View style={[styles.container, { opacity: pageFadeAnim }]}>
        {Platform.OS === 'web' && <View style={styles.backgroundPattern} />}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={closeAccountCreated}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <X size={24} color="#64748b" />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={[styles.authCardWrapper, styles.verifyEmailCardWrapper]}>
            <View style={styles.authCard}>
              <View style={styles.verifyLogoRow}>
                <Image
                  source={require('../assets/icon.png')}
                  style={styles.verifyLogoImage}
                  resizeMode="contain"
                />
                <Text style={styles.verifyLogoText}>learnadoodle</Text>
              </View>

              <View style={styles.verifyIconCircle}>
                <Mail size={28} color="#0d9488" strokeWidth={2} />
                <View style={styles.verifyCheckBadge}>
                  <CheckCircle2 size={22} color="#10b981" fill="#ecfdf5" />
                </View>
              </View>

              <Text style={styles.verifyTitle}>Check your email to continue</Text>
              <Text style={styles.verifyBody}>
                We sent you a confirmation link. Once you verify your email, you can sign in and start planning.
              </Text>
              {confirmationEmail ? (
                <Text style={styles.verifyEmailLine}>
                  Sent to: <Text style={styles.verifyEmailAddress}>{confirmationEmail}</Text>
                </Text>
              ) : null}
              <Text style={styles.verifyTimingHint}>Takes about 1–2 minutes to arrive.</Text>

              {resendFeedback ? (
                <Text
                  style={[
                    styles.verifyFeedbackText,
                    resendFeedback.includes('don’t see') || resendFeedback.includes('Could not') || resendFeedback.includes('went wrong')
                      ? styles.verifyFeedbackWarn
                      : styles.verifyFeedbackOk,
                  ]}
                >
                  {resendFeedback}
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.verifySecondaryButton}
                onPress={checkVerificationAndRedirect}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.verifySecondaryButtonText}>I’ve verified my email</Text>
              </TouchableOpacity>

              <View style={styles.verifyFooterLinks}>
                <TouchableOpacity
                  onPress={handleResendConfirmation}
                  disabled={resendLoading || !confirmationEmail}
                  {...(Platform.OS === 'web' && { cursor: resendLoading || !confirmationEmail ? 'not-allowed' : 'pointer' })}
                >
                  <Text style={[styles.verifyFooterLink, (resendLoading || !confirmationEmail) && styles.verifyFooterLinkDisabled]}>
                    {resendLoading ? 'Sending…' : 'Resend email'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.verifyFooterDot}>·</Text>
                <TouchableOpacity
                  onPress={handleChangeEmailFromVerify}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.verifyFooterLink}>Change email</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    );
  }

  // Show landing page (skip loader when returning from modal close so it shows immediately)
  if (showWelcome) {
    return (
      <LandingPage
        skipLoader={justClosedModal}
        onGetStarted={() => {
          setJustClosedModal(false);
          setShowWelcome(false);
          setIsSignUp(true);
          updateURL('signup');
        }}
        onLogIn={() => {
          setJustClosedModal(false);
          setShowWelcome(false);
          setIsSignUp(false);
          updateURL('signin');
        }}
      />
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: pageFadeAnim }]}>
      {Platform.OS === 'web' && (
        <View style={styles.backgroundPattern} />
      )}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <X size={24} color="#64748b" />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.contentContainer}>
      <View style={styles.authCardWrapper}>
        <View style={styles.authCard}>
        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Hello again!'}</Text>
        <Text style={styles.subtitle}>
          {isSignUp
            ? "Enter your email and we'll send you a link to create your account"
            : 'SIGN IN TO CONTINUE LEARNING'
          }
        </Text>
        
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        
        {existingEmailOfferReset ? (
          <View style={styles.existingEmailBox}>
            <Text style={styles.existingEmailText}>Send a password reset link to this email?</Text>
            <TouchableOpacity
              style={styles.resetLinkButton}
              onPress={handleSendResetForExistingEmail}
              disabled={loading}
            >
              <Text style={styles.resetLinkButtonText}>{loading ? 'Sending…' : 'Send password reset link'}</Text>
            </TouchableOpacity>
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
            onSubmitEditing={handleAuth}
            onKeyPress={e => {
              if (e.nativeEvent.key === 'Enter') handleAuth();
            }}
          />
        </View>
        
        {!isSignUp && (
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
                onSubmitEditing={handleAuth}
                onKeyPress={e => {
                  if (e.nativeEvent.key === 'Enter') handleAuth();
                }}
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
            {loading ? 'Sending link…' : (isSignUp ? 'Send sign up link' : 'Sign In')}
          </Text>
        </TouchableOpacity>

        {!isResetPassword ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <TouchableOpacity
              style={[styles.googleButton, loading && styles.disabledButton]}
              onPress={handleGoogleAuth}
              disabled={loading}
            >
              <View style={styles.googleButtonContent}>
                <Image source={googleLogo} style={styles.googleButtonIcon} resizeMode="contain" />
                <Text style={styles.googleButtonText}>CONTINUE WITH GOOGLE</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : null}
        
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
            {' .'}
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
    overflow: 'hidden',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
    ...(Platform.OS === 'web' && {
      backgroundImage: `radial-gradient(circle at 20% 50%, rgba(96, 165, 250, 0.3) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(147, 197, 253, 0.3) 0%, transparent 50%),
                        radial-gradient(circle at 40% 20%, rgba(191, 219, 254, 0.2) 0%, transparent 50%)`,
      pointerEvents: 'none',
    }),
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
  authCardWrapper: {
    width: '100%',
    maxWidth: 400,
    ...(Platform.OS === 'web' ? {
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderRadius: 16,
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      // Ensure the element can blur
      isolation: 'isolate',
    } : {}),
  },
  authCard: {
    padding: 32,
    width: '100%',
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
    paddingVertical: 10,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 10,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleButtonIcon: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
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
  existingEmailBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  existingEmailText: {
    color: '#0369a1',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  resetLinkButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
  },
  resetLinkButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  verifyEmailCardWrapper: {
    maxWidth: 420,
  },
  verifyLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  verifyLogoImage: {
    width: 48,
    height: 48,
  },
  verifyLogoText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 22,
    position: 'relative',
  },
  verifyCheckBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
  },
  verifyTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyBody: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyEmailLine: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyEmailAddress: {
    color: '#1f2937',
    fontWeight: '600',
  },
  verifyTimingHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyFeedbackText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyFeedbackOk: {
    color: '#15803d',
  },
  verifyFeedbackWarn: {
    color: '#b45309',
  },
  verifySecondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  verifySecondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyFooterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  verifyFooterLink: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  verifyFooterLinkDisabled: {
    color: '#9ca3af',
  },
  verifyFooterDot: {
    color: '#9ca3af',
    fontSize: 14,
    paddingHorizontal: 4,
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
