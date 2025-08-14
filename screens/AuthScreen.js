import React, { useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useAuth } from '../contexts/AuthContext'

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [isResetPassword, setIsResetPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const { signIn, signUp, resetPassword } = useAuth()

  const validatePassword = (password) => {
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasDigits = /\d/.test(password)
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    
    return {
      isValid: hasUpperCase && hasLowerCase && hasDigits && hasSymbols,
      hasUpperCase,
      hasLowerCase,
      hasDigits,
      hasSymbols
    }
  }

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    if (isSignUp) {
      // Check password requirements
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        const missingRequirements = []
        if (!passwordValidation.hasUpperCase) missingRequirements.push('uppercase letter')
        if (!passwordValidation.hasLowerCase) missingRequirements.push('lowercase letter')
        if (!passwordValidation.hasDigits) missingRequirements.push('digit')
        if (!passwordValidation.hasSymbols) missingRequirements.push('symbol')
        
        Alert.alert(
          'Password Requirements', 
          `Password must contain at least one: ${missingRequirements.join(', ')}`
        )
        return
      }

      // Check password confirmation
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match')
        return
      }

      // Check minimum length
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters')
        return
      }
    }

    setLoading(true)

    try {
      console.log('Attempting to', isSignUp ? 'sign up' : 'sign in', 'with email:', email)
      
      const { data, error } = isSignUp 
        ? await signUp(email, password)
        : await signIn(email, password)

      console.log('Auth response:', { data, error })

      if (error) {
        console.error('Auth error:', error)
        Alert.alert('Error', error.message)
      } else if (isSignUp) {
        console.log('Signup successful, user:', data?.user)
        console.log('Session:', data?.session)
        
        // Check if user needs email confirmation
        if (data?.user && !data?.session) {
          Alert.alert(
            'Account Created!', 
            'Please check your email and click the confirmation link to verify your account. You can then sign in.',
            [{ text: 'OK', onPress: () => setIsSignUp(false) }]
          )
        } else if (data?.session) {
          Alert.alert(
            'Success!', 
            'Account created and signed in successfully!',
            [{ text: 'OK' }]
          )
        } else {
          Alert.alert(
            'Account Created!', 
            'Please check your email to verify your account.',
            [{ text: 'OK', onPress: () => setIsSignUp(false) }]
          )
        }
      } else {
        console.log('Sign in successful, user:', data?.user)
      }
    } catch (error) {
      console.error('Auth exception:', error)
      Alert.alert('Error', 'An unexpected error occurred: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    console.log('Attempting to reset password for email:', email)
    setLoading(true)

    try {
      console.log('Calling resetPassword function...')
      const { data, error } = await resetPassword(email)
      console.log('Reset password response:', { data, error })

      if (error) {
        console.error('Reset password error:', error)
        Alert.alert('Error', error.message)
      } else {
        console.log('Reset password successful, data:', data)
        Alert.alert(
          'Success', 
          'Password reset email sent! Please check your email for instructions.',
          [{ text: 'OK', onPress: () => setIsResetPassword(false) }]
        )
      }
    } catch (error) {
      console.error('Reset password exception:', error)
      Alert.alert('Error', 'An unexpected error occurred: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBackToSignIn = () => {
    setIsResetPassword(false)
    setIsSignUp(false)
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.content}>
          <Text style={styles.title}>
            {isResetPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Welcome Back')}
          </Text>
          <Text style={styles.subtitle}>
            {isResetPassword 
              ? 'Enter your email to receive reset instructions' 
              : (isSignUp ? 'Sign up to get started' : 'Sign in to continue')
            }
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!isResetPassword && (
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {isSignUp && (
              <>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                                      <Text style={styles.eyeIcon}>
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Password Requirements */}
                {password.length > 0 && (
                  <View style={styles.passwordRequirements}>
                    <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        /[A-Z]/.test(password) && styles.requirementMet
                      ]}>
                        ✓ Uppercase letter (A-Z)
                      </Text>
                    </View>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        /[a-z]/.test(password) && styles.requirementMet
                      ]}>
                        ✓ Lowercase letter (a-z)
                      </Text>
                    </View>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        /\d/.test(password) && styles.requirementMet
                      ]}>
                        ✓ Digit (0-9)
                      </Text>
                    </View>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) && styles.requirementMet
                      ]}>
                        ✓ Symbol (!@#$%^&*...)
                      </Text>
                    </View>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        password.length >= 6 && styles.requirementMet
                      ]}>
                        ✓ At least 6 characters
                      </Text>
                    </View>
                    <View style={styles.requirementItem}>
                      <Text style={[
                        styles.requirementText,
                        password === confirmPassword && confirmPassword.length > 0 && styles.requirementMet
                      ]}>
                        ✓ Passwords match
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={isResetPassword ? handleResetPassword : handleAuth}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading 
                  ? 'Loading...' 
                  : (isResetPassword 
                      ? 'Send Reset Email' 
                      : (isSignUp ? 'Sign Up' : 'Sign In')
                    )
                }
              </Text>
            </TouchableOpacity>
          </View>

          {!isResetPassword && !isSignUp && (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => setIsResetPassword(true)}
            >
              <Text style={styles.resetText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          {isResetPassword && (
            <TouchableOpacity
              style={styles.switchButton}
              onPress={handleBackToSignIn}
            >
              <Text style={styles.switchText}>Back to Sign In</Text>
            </TouchableOpacity>
          )}

          {!isResetPassword && (
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsSignUp(!isSignUp)}
            >
              <Text style={styles.switchText}>
                {isSignUp 
                  ? 'Already have an account? Sign In' 
                  : "Don't have an account? Sign Up"
                }
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 30,
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.25)',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#4a5568',
    textAlign: 'center',
    marginBottom: 30,
  },
  form: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 15,
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
  },
  eyeButton: {
    padding: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#667eea',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#a0aec0',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchButton: {
    alignItems: 'center',
    padding: 10,
  },
  switchText: {
    color: '#667eea',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  resetButton: {
    alignItems: 'center',
    padding: 10,
    marginBottom: 10,
  },
  resetText: {
    color: '#667eea',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  passwordRequirements: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 8,
  },
  requirementItem: {
    marginBottom: 4,
  },
  requirementText: {
    fontSize: 12,
    color: '#718096',
  },
  requirementMet: {
    color: '#38a169',
    fontWeight: '500',
  },
}) 