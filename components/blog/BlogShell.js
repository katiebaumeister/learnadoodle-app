import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import BlogSearchBar from './BlogSearchBar';

export default function BlogShell({ children, onNavigateToLogin, onNavigateToSignUp }) {
  return (
    <View style={styles.container}>
      {/* Sticky Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.logoContainer}>
              <Image 
                source={require('../../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.logo}>learnadoodle</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.searchContainer}>
            <BlogSearchBar />
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(Platform.OS === 'web' ? {
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
    } : {
      flex: 1,
    }),
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  headerContent: {
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    gap: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  logo: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    textTransform: 'lowercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchContainer: {
    flex: 1,
    maxWidth: 500,
    ...(Platform.OS === 'web' && {
      marginLeft: 'auto',
      paddingLeft: 16,
    }),
  },
  content: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      padding: 0,
    }),
  },
});
