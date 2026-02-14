/**
 * RoleGate Component
 * 
 * Blocks render until session context is loaded, then chooses
 * the appropriate navigator based on user role:
 * - ParentNavigator (existing parent experience)
 * - ChildNavigator (simplified child/student experience)
 * - TutorNavigator (tutor experience with assigned children only)
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import ParentNavigator from './ParentNavigator';
import ChildNavigator from './ChildNavigator';
import TutorNavigator from './TutorNavigator';

export default function RoleGate({ children, ...props }) {
  const session = useSession();

  // Show loading while session is being resolved
  if (session.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#887DEE" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // If no session or no family, show error
  if (!session || !session.family_id) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Unable to Load</Text>
        <Text style={styles.errorText}>
          We couldn't load your account information. Please try refreshing the page.
        </Text>
      </View>
    );
  }

  // Route to appropriate navigator based on role
  const { role_flags, effective_role } = session;

  if (role_flags.isChild) {
    return <ChildNavigator session={session} user={props.user} {...props} />;
  } else if (role_flags.isTutor) {
    return <TutorNavigator session={session} user={props.user} {...props} />;
  } else {
    // Default to parent navigator (includes fallback for unknown roles)
    return <ParentNavigator session={session} user={props.user} {...props} />;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
