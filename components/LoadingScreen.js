import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

export default function LoadingScreen({ message = 'Loading...', timeout = 10000 }) {
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    // Show timeout message after specified time
    const timeoutId = setTimeout(() => {
      setShowTimeoutMessage(true);
    }, timeout);

    // Animate loading dots
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
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>🎓</Text>
        </View>
        
        <Text style={styles.title}>Learnadoodle</Text>
        <Text style={styles.subtitle}>Loading your learning environment</Text>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38B6FF" />
          <Text style={styles.loadingText}>
            {message}{dots}
          </Text>
        </View>

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
    flex: 1,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logo: {
    fontSize: 64,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 40,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  loadingText: {
    fontSize: 16,
    color: 'white',
    marginTop: 16,
    textAlign: 'center',
  },
  timeoutContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    maxWidth: 400,
  },
  timeoutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
    textAlign: 'center',
  },
  timeoutMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  timeoutTip: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
