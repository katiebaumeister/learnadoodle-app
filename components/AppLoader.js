import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';

/**
 * Shared loading screen: white background, light blue spinner, "learnadoodle" text.
 * Use for initial landing page, app load/refresh, and any full-page loading spinner.
 */
export default function AppLoader({ style }) {
  return (
    <View style={[styles.overlay, style]}>
      <View style={styles.inner}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.brandText}>learnadoodle</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      width: '100vw',
      height: '100vh',
      minWidth: '100vw',
      minHeight: '100vh',
      zIndex: 99999,
    }),
  },
  inner: {
    alignItems: 'center',
    gap: 16,
  },
  brandText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
