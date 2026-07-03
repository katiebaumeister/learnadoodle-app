import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Eye, EyeOff } from 'lucide-react';
import { validatePassword } from '../../lib/passwordValidation';

export default function PasswordSetupFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  passwordLabel = 'Password',
  confirmLabel = 'Confirm password',
  passwordPlaceholder = 'Create a password',
  confirmPlaceholder = 'Confirm password',
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const validation = validatePassword(password || '');

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>{passwordLabel}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder={passwordPlaceholder}
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            {showPassword ? <EyeOff size={20} color="#6b7280" /> : <Eye size={20} color="#6b7280" />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{confirmLabel}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder={confirmPlaceholder}
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            {showConfirmPassword ? <EyeOff size={20} color="#6b7280" /> : <Eye size={20} color="#6b7280" />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.requirements}>
        <Text style={styles.requirementsTitle}>Password requirements</Text>
        <Text style={[styles.requirement, validation.hasMinLength && styles.requirementMet]}>
          • At least 10 characters long
        </Text>
        <Text style={[styles.requirement, validation.hasUpperCase && styles.requirementMet]}>
          • Contains uppercase letter
        </Text>
        <Text style={[styles.requirement, validation.hasLowerCase && styles.requirementMet]}>
          • Contains lowercase letter
        </Text>
        <Text style={[styles.requirement, validation.hasDigits && styles.requirementMet]}>
          • Contains number
        </Text>
        <Text style={[styles.requirement, validation.hasSpecialChar && styles.requirementMet]}>
          • Contains special character
        </Text>
        {password && confirmPassword ? (
          <Text style={[styles.requirement, password === confirmPassword && styles.requirementMet]}>
            • Passwords match
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  passwordRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingRight: 48,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  requirements: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 16,
    marginBottom: 4,
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
});
