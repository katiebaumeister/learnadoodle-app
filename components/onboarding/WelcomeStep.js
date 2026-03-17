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
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      fontFamily: '"League Spartan", sans-serif',
      cursor: 'pointer',
    }),
  },
  continueBtnHovered: {
    backgroundColor: '#78BCEF',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});
