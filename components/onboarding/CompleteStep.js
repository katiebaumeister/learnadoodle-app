import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CheckCircle } from 'lucide-react';
import {
  ONBOARDING_SKY,
  ONBOARDING_CONTINUE_BTN,
  ONBOARDING_CONTINUE_BTN_TEXT,
  ONBOARDING_CONTINUE_BTN_DISABLED,
} from '../../lib/constants/onboardingTheme';

export default function CompleteStep({ onFinish, isSaving }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <CheckCircle size={48} color="#10B981" />
      </View>
      <Text style={styles.title}>You're all set</Text>
      <Text style={styles.subtitle}>
        Finish setup to unlock Learnadoodle. You can add more children anytime in your family settings.
      </Text>
      <TouchableOpacity
        style={[styles.finishBtn, isSaving && styles.finishBtnDisabled]}
        onPress={onFinish}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.finishBtnText}>
          {isSaving ? 'Finishing…' : 'Finish setup'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  finishBtn: {
    ...ONBOARDING_CONTINUE_BTN,
    backgroundColor: ONBOARDING_SKY,
    alignSelf: 'flex-end',
  },
  finishBtnDisabled: {
    ...ONBOARDING_CONTINUE_BTN_DISABLED,
  },
  finishBtnText: {
    ...ONBOARDING_CONTINUE_BTN_TEXT,
  },
});
