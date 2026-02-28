import React, { useState, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import WebAuthScreen from './WebAuthScreen';
import PasswordResetPage from './PasswordResetPage';
import WebLayout from './WebLayout';
import InviteAcceptancePage from './InviteAcceptancePage';
import InviteLandingPage from './InviteLandingPage';
import ChildInvitePage from './auth/ChildInvitePage';
import ContinueLearningPage from './ContinueLearningPage';
import TermsPage from './TermsPage';
import PrivacyPage from './PrivacyPage';
import AboutPage from './AboutPage';
import FAQPage from './FAQPage';
import ContactPage from './ContactPage';
import SubscriptionPage from './SubscriptionPage';
import BlogIndexPage from './blog/BlogIndexPage';
import BlogPostPage from './blog/BlogPostPage';
import BlogAllPage from './blog/BlogAllPage';
import { useAuth } from '../contexts/AuthContext';
import { SessionProvider } from '../contexts/SessionContext';
import RoleGate from './navigation/RoleGate';

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

    // Handle email verification tokens in URL hash
    // Supabase automatically processes these, but we should clean up the URL
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      // If we have email verification tokens, clean up the URL hash
      // Supabase client will automatically process these via onAuthStateChange
      if (accessToken && type === 'email') {
        // Clean up the URL hash without reloading
        const cleanUrl = window.location.origin + window.location.pathname + (window.location.search || '');
        window.history.replaceState({}, typeof document !== 'undefined' ? document.title : '', cleanUrl);
      }
    }

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
            window.history.replaceState({}, typeof document !== 'undefined' ? document.title : '', cleanUrl);
            
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

  // After sign-in from invite: if user is on / with ?invite=TOKEN, send them to /invite/TOKEN to accept
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (inviteToken && window.location.pathname === '/') {
      window.history.replaceState({}, '', `/invite/${inviteToken}`);
      setCurrentPath(`/invite/${inviteToken}`);
    }
  }, [user]);

  // If we're in a password reset flow, wait for auth to be ready
  if (isPasswordResetFlow) {
    
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

  // Public invite landing (learnadoodle.com/invites/:token) — friendly message then CTA to app to sign in/accept
  const invitesLandingMatch = currentPath.match(/^\/invites\/(.+)$/);
  const invitesLandingToken = invitesLandingMatch ? invitesLandingMatch[1] : null;

  if (invitesLandingToken) {
    return (
      <InviteLandingPage
        token={invitesLandingToken}
      />
    );
  }

  // App invite page (app.learnadoodle.com/invite/:token) — sign in / sign up then accept invite
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


  // Handle public pages (terms, privacy, about) - accessible without authentication
  if (currentPath === '/terms') {
    return (
      <TermsPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  if (currentPath === '/privacy') {
    return (
      <PrivacyPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  if (currentPath === '/about' || currentPath.startsWith('/about#')) {
    return (
      <AboutPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  if (currentPath === '/help/faqs' || currentPath === '/faq') {
    return (
      <FAQPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  if (currentPath === '/contact') {
    return (
      <ContactPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  if (currentPath === '/subscription' || currentPath === '/products/super-doodle') {
    return (
      <SubscriptionPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signin';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/?view=signup';
          }
        }}
      />
    );
  }

  // Handle blog routes
  if (currentPath === '/blog/all' || currentPath.startsWith('/blog/all?') || 
      currentPath === '/blog/search' || currentPath.startsWith('/blog/search?')) {
    return (
      <BlogAllPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
      />
    );
  }

  if (currentPath === '/blog' || currentPath === '/blog/') {
    return (
      <BlogIndexPage
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
      />
    );
  }

  // Handle individual blog post routes
  const blogPostMatch = currentPath.match(/^\/blog\/(.+)$/);
  const blogPostSlug = blogPostMatch ? blogPostMatch[1] : null;

  if (blogPostSlug) {
    return (
      <BlogPostPage
        slug={blogPostSlug}
        onNavigateToLogin={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
        onNavigateToSignUp={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
      />
    );
  }

  // If no user, show appropriate auth screen based on route
  if (!user) {
    if (currentPath === '/reset-password') {
      return <PasswordResetPage />;
    }
    // Show WebAuthScreen for sign in/sign up
    // Account creation happens here, then user verifies email, then signs in
    return <WebAuthScreen />;
  }

  // User is authenticated, show main app
  // Wrap with SessionProvider for role-based access control
  // RoleGate will choose the appropriate navigator based on role
  return (
    <SessionProvider>
      <RoleGate user={user} />
    </SessionProvider>
  );
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
