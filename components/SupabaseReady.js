import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export default function SupabaseReady({ children }) {
  // On web, start ready so landing page shows immediately; we still run the check in background
  const [isReady, setIsReady] = useState(Platform.OS === 'web');
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    let timeoutId = null;

    const checkSupabase = async () => {
      try {
        // Test the connection by making a simple query
        // Timeout is handled globally in supabase.js (20 seconds)
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .limit(1);
        
        if (error) {
          throw error;
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        // Check if it's a timeout error
        if (err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('aborted')) {
          if (mounted) {
            setError('Connection timeout. The database is taking too long to respond. Please check your internet connection and try again.');
          }
          return;
        }
        
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          
          setTimeout(checkSupabase, 2000); // Increased retry delay to 2 seconds
        } else if (mounted) {
          const errorMsg = err.message || 'Failed to connect to database after multiple attempts. Please check your internet connection.';
          setError(errorMsg);
        }
      }
    };

    // Add a small delay to ensure Supabase client is fully initialized
    const timer = setTimeout(() => {
      checkSupabase();
    }, 500);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Text style={styles.errorTip}>
          Please check your internet connection and refresh the page.
        </Text>
      </View>
    );
  }

  // Don't render anything until Supabase is ready - no loading screen
  if (!isReady) {
    return null;
  }

  return children;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#9DB5D8', // Periwinkle blue background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 600,
  },
  errorTip: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 600,
  },
});
