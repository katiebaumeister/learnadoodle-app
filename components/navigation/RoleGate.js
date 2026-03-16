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
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import ParentNavigator from './ParentNavigator';
import TutorNavigator from './TutorNavigator';
import AppLoader from '../AppLoader';

export default function RoleGate({ children, ...props }) {
  const session = useSession();

  // Show loading while session is being resolved (same as landing: white + light blue spinner + learnadoodle)
  if (session.loading) {
    return <AppLoader />;
  }

  // If no session, show error. If session but no family_id: allow parent through (new signup → onboarding will create family); others show error.
  const isNewParent = session?.role_flags?.isParent === true;
  if (!session || (!session.family_id && !isNewParent)) {
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
  // Child users use the same shell as parents (WebLayout: left sidebar + center grid) so structure/UI match; only content is child-scoped.
  const { role_flags, effective_role } = session;

  if (role_flags.isChild) {
    return <ParentNavigator session={session} user={props.user} userRole="child" {...props} />;
  } else if (role_flags.isTutor) {
    return <TutorNavigator session={session} user={props.user} {...props} />;
  } else {
    // Default to parent navigator (includes fallback for unknown roles)
    return <ParentNavigator session={session} user={props.user} {...props} />;
  }
}

const styles = StyleSheet.create({
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
