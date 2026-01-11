import React, { useState, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import WebAuthScreen from './WebAuthScreen';
import PasswordResetPage from './PasswordResetPage';
import WebLayout from './WebLayout';
import InviteAcceptancePage from './InviteAcceptancePage';
import ChildInvitePage from './auth/ChildInvitePage';
import ContinueLearningPage from './ContinueLearningPage';
import { useAuth } from '../contexts/AuthContext';

export default function WebRouter() {
  const { user, loading, session } = useAuth();
  const [currentPath, setCurrentPath] = useState('/');
  const [isPasswordResetFlow, setIsPasswordResetFlow] = useState(false);
  const [resetFlowStartTime, setResetFlowStartTime] = useState(null);

  useEffect(() => {
    // Update path when URL changes
    const updatePath = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', updatePath);
    
    // Initial path
    updatePath();

    // Check if we're in a password reset flow
    const checkPasswordResetFlow = () => {
      // Check URL parameters for password reset indicators
      const urlParams = new URLSearchParams(window.location.search);
      const hasResetToken = urlParams.has('access_token') || urlParams.has('refresh_token');
      const isResetPath = window.location.pathname === '/reset-password';
      
      // Check if we have a hash fragment that might contain reset info
      const hasResetHash = window.location.hash.includes('access_token') || 
                          window.location.hash.includes('type=recovery');
      
      if (hasResetToken || isResetPath || hasResetHash) {
        // Only set reset flow if not already set
        if (!isPasswordResetFlow) {
          setIsPasswordResetFlow(true);
          setResetFlowStartTime(Date.now());
}
        
        // If we have reset tokens in the hash, try to manually process them
        if (hasResetHash) {
          // Parse the tokens from the hash and try to establish the session
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          if (accessToken) {
            // Try to trigger the auth state change by updating the URL and reloading
            // This should allow Supabase to process the tokens properly
            const cleanUrl = window.location.origin + '/';
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Force a reload to trigger auth state re-evaluation
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      }
    };

    checkPasswordResetFlow();

    return () => {
      window.removeEventListener('popstate', updatePath);
    };
  }, []);

  // Auto-clear reset flow if it takes too long (prevents infinite loops)
  useEffect(() => {
    if (isPasswordResetFlow && resetFlowStartTime) {
      // Check auth state every 5 seconds during reset flow
      const interval = setInterval(() => {
        const elapsed = Date.now() - resetFlowStartTime;

        // If user gets authenticated, clear reset flow immediately
        if (user) {
          setIsPasswordResetFlow(false);
          setResetFlowStartTime(null);
          return;
        }
        
        // If timeout reached, clear reset flow
        if (elapsed > 60000) { // 60 seconds - give much more time for auth state to update

          setIsPasswordResetFlow(false);
          setResetFlowStartTime(null);
        }
      }, 5000); // Check every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [isPasswordResetFlow, resetFlowStartTime, user]);

  // Show loading screen while auth is initializing
  if (loading) {
    return null; // Let the parent handle loading
  }

  // If we're in a password reset flow, wait for auth to be ready
  if (isPasswordResetFlow) {
    // Wait for auth to be fully loaded and check if user is now authenticated
    if (loading) {
      return null; // Still loading auth state
    }
    
    // Debug: Log the current state

    // If user is now authenticated, they don't need the reset page
    if (user) {
      setIsPasswordResetFlow(false);
      setResetFlowStartTime(null);
      return <WebLayout user={user} />;
    }
    
    // Check if we have expired/invalid tokens by looking at the current URL
    const hasValidTokens = window.location.hash.includes('access_token') && 
                          window.location.hash.includes('type=recovery');
    
    if (!hasValidTokens) {
      setIsPasswordResetFlow(false);
      setResetFlowStartTime(null);
      // Show expired token message
      return (
        <View style={styles.resetLoadingContainer}>
          <Text style={styles.resetLoadingTitle}>Reset Link Expired</Text>
          <Text style={styles.resetLoadingSubtitle}>Your password reset link has expired or is invalid. Please request a new one.</Text>
          <TouchableOpacity 
            style={styles.backToLoginButton}
            onPress={() => window.location.href = '/'}
          >
            <Text style={styles.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Show reset page if user is not authenticated but has valid tokens
    return <PasswordResetPage onPasswordResetComplete={() => {
      setIsPasswordResetFlow(false);
      setResetFlowStartTime(null);
    }} />;
  }

  // Check if we're on a child invite page
  const childInviteMatch = currentPath.match(/^\/child\/invite\/(.+)$/);
  const childInviteToken = childInviteMatch ? childInviteMatch[1] : null;

  if (childInviteToken) {
    return (
      <ChildInvitePage
        token={childInviteToken}
        onComplete={(data) => {
          // Redirect handled by component
        }}
      />
    );
  }

  // Check if we're on a regular invite page
  const inviteMatch = currentPath.match(/^\/invite\/(.+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;

  if (inviteToken) {
    return (
      <InviteAcceptancePage
        token={inviteToken}
        onAcceptComplete={(data) => {
          // After accepting, redirect based on role
          // The component handles the redirect, but we can also handle it here
}}
      />
    );
  }

  // Check if we're on a continue learning deep link
  // Route: /continue/{courseId}?child={childId}&lesson={lessonId}&t={timestamp}
  const continueMatch = currentPath.match(/^\/continue\/([^/?]+)/);
  const continueCourseId = continueMatch ? continueMatch[1] : null;

  if (continueCourseId) {
    // Extract query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const childId = urlParams.get('child');
    const lessonId = urlParams.get('lesson');
    const timestamp = urlParams.get('t') ? parseInt(urlParams.get('t'), 10) : null;

    // If no user, redirect to login (they need to be authenticated)
    if (!user) {
      return <WebAuthScreen />;
    }

    return (
      <ContinueLearningPage
        courseId={continueCourseId}
        childId={childId}
        lessonId={lessonId}
        timestamp={timestamp}
      />
    );
  }

  // If no user, show appropriate auth screen based on route
  if (!user) {
    if (currentPath === '/reset-password') {
      return <PasswordResetPage />;
    }
    return <WebAuthScreen />;
  }

  // User is authenticated, show main app
  // Role-based routing will be handled by WebLayout based on /api/me response
  return <WebLayout user={user} />;
}

const styles = StyleSheet.create({
  resetLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  resetLoadingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  resetLoadingSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});
