import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import AppLoader from './AppLoader';

export default function LoadingScreen({ message = 'Loading...', timeout = 10000 }) {
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timeoutId = setTimeout(() => setShowTimeoutMessage(true), timeout);
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(dotsInterval);
    };
  }, [timeout]);

  return (
    <View style={styles.container}>
      <AppLoader style={styles.loaderFill} />
      <View style={styles.content}>
        {showTimeoutMessage && (
          <View style={styles.timeoutContainer}>
            <Text style={styles.timeoutTitle}>Taking longer than expected?</Text>
            <Text style={styles.timeoutMessage}>
              If the app doesn't load within a few more seconds, try refreshing the page.
            </Text>
            <Text style={styles.timeoutTip}>
              💡 Tip: Check your internet connection and try again.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(Platform.OS === 'web' ? {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      minHeight: '100vh',
      minWidth: '100vw',
      zIndex: 99999,
    } : {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      flex: 1,
      zIndex: 9999,
    }),
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  timeoutContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    maxWidth: 400,
  },
  timeoutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  timeoutMessage: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  timeoutTip: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
