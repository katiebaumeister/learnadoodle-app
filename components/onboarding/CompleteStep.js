import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CheckCircle } from 'lucide-react';

export default function CompleteStep({ onFinish, isSaving }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <CheckCircle size={48} color="#10B981" />
      </View>
      <Text style={styles.title}>You're all set</Text>
      <Text style={styles.subtitle}>
        Finish setup to start planning. You can add more children and subjects anytime from settings.
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
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  finishBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
  },
  finishBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});
