import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import LoadingScreen from './LoadingScreen';

export default function SupabaseReady({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const checkSupabase = async () => {
      try {
        console.log('SupabaseReady: Checking Supabase connection, attempt:', retryCount + 1);
        
        // Test the connection by making a simple query
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .limit(1);
        
        if (error) {
          console.error('SupabaseReady: Connection test failed:', error);
          throw error;
        }

        if (mounted) {
          console.log('SupabaseReady: Connection successful');
          setIsReady(true);
        }
      } catch (err) {
        console.error('SupabaseReady: Connection check failed:', err);
        
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          console.log(`SupabaseReady: Retrying in 1 second... (${retryCount}/${maxRetries})`);
          setTimeout(checkSupabase, 1000);
        } else if (mounted) {
          console.error('SupabaseReady: Max retries reached, showing error');
          setError('Failed to connect to database after multiple attempts');
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

  if (!isReady) {
    return <LoadingScreen message="Connecting to database" timeout={10000} />;
  }

  return children;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorTip: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
