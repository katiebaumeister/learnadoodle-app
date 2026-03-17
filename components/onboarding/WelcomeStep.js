import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export default function WelcomeStep({ onNext }) {
  const [continueHovered, setContinueHovered] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome to Learnadoodle!</Text>
      <Text style={styles.subtext}>
        We need some quick details before getting started.
      </Text>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          Platform.OS === 'web' && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={onNext}
        onMouseEnter={Platform.OS === 'web' ? () => setContinueHovered(true) : undefined}
        onMouseLeave={Platform.OS === 'web' ? () => setContinueHovered(false) : undefined}
        activeOpacity={0.9}
      >
        <Text style={styles.continueBtnText}>Get started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.95)',
    marginBottom: 12,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  subtext: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  continueBtn: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(17,24,39,0.25)',
      fontFamily: '"League Spartan", sans-serif',
      cursor: 'pointer',
    }),
  },
  continueBtnHovered: {
    backgroundColor: '#1f2937',
  },
  continueBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});
