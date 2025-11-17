import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function WebAuthScreen() {
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

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };



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

  const handleAuth = async () => {
    clearMessages();
    
    if (!email || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (isSignUp) {
      // Check password requirements
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        const missingRequirements = [];
        if (!passwordValidation.hasUpperCase) missingRequirements.push('uppercase letter');
        if (!passwordValidation.hasLowerCase) missingRequirements.push('lowercase letter');
        if (!passwordValidation.hasDigits) missingRequirements.push('digit');
        if (!passwordValidation.hasSymbols) missingRequirements.push('symbol');
        
        setErrorMessage(`Password must contain at least one: ${missingRequirements.join(', ')}`);
        return;
      }

      // Check password confirmation
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match');
        return;
      }

      // Check minimum length
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters');
        return;
      }
    }

    setLoading(true);

    try {
      console.log('Attempting to', isSignUp ? 'sign up' : 'sign in', 'with email:', email);
      
      const { data, error } = isSignUp 
        ? await signUp(email, password)
        : await signIn(email, password);

      console.log('Auth response:', { data, error });

      if (error) {
        console.error('Auth error:', error);
        setErrorMessage(error.message);
      } else if (isSignUp) {
        console.log('Signup successful, user:', data?.user);
        console.log('Session:', data?.session);
        
        // Check if user needs email confirmation
        if (data?.user && !data?.session) {
          setSuccessMessage('Account Created! Please check your email and click the confirmation link to verify your account. You can then sign in.');
          setIsSignUp(false); // Switch to sign in mode
        } else {
          setSuccessMessage('Account created and signed in successfully!');
        }
      } else {
        console.log('Sign in successful');
        setSuccessMessage('Signed in successfully!');
      }
    } catch (error) {
      console.error('Auth exception:', error);
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
        setSuccessMessage('Password reset email sent! Please check your inbox and follow the instructions.');
        setIsResetPassword(false);
      }
    } catch (error) {
      console.error('Reset password exception:', error);
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
            <Text style={styles.inputLabel}>Email Address</Text>
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
            onPress={() => setIsResetPassword(false)}
          >
            <Text style={styles.linkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.authCard}>
        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
        <Text style={styles.subtitle}>
          {isSignUp 
            ? 'Sign up to start your learning journey' 
            : 'Sign in to continue learning'
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
          <Text style={styles.inputLabel}>Email Address</Text>
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
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.textInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        
        {isSignUp && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <TextInput
              style={styles.textInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}
        
        <TouchableOpacity
          style={[styles.authButton, loading && styles.disabledButton]}
          onPress={handleAuth}
          disabled={loading}
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
            }}
          >
            <Text style={styles.linkText}>
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
          
          {!isSignUp && (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setIsResetPassword(true)}
            >
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}
        </View>


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
  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
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
  authButton: {
    backgroundColor: '#38B6FF',
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
    fontWeight: '600',
  },
  linkContainer: {
    alignItems: 'center',
    gap: 12,
  },
  linkButton: {
    padding: 8,
  },
  linkText: {
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
  },

});
