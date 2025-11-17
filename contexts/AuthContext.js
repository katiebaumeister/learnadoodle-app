import React, { createContext, useContext, useEffect, useState } from 'react'
import { auth } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  return useContext(AuthContext)
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false)

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    // Check for auto-login parameter
    const checkAutoLogin = async () => {
      if (typeof window === 'undefined' || autoLoginAttempted) return;
      
      const urlParams = new URLSearchParams(window.location.search);
      const shouldAutoLogin = urlParams.get('autoLogin') === 'true' || urlParams.get('demo') === 'true';
      
      if (!shouldAutoLogin) return;
      
      // Get credentials from environment variables or use defaults
      const autoLoginEmail = process.env.REACT_APP_AUTO_LOGIN_EMAIL || process.env.EXPO_PUBLIC_AUTO_LOGIN_EMAIL || 'katiebaumeister@icloud.com';
      const autoLoginPassword = process.env.REACT_APP_AUTO_LOGIN_PASSWORD || process.env.EXPO_PUBLIC_AUTO_LOGIN_PASSWORD;
      
      if (!autoLoginPassword) {
        console.log('Auto-login requested but no password configured in environment variables');
        return;
      }
      
      console.log('Auto-login detected, attempting to sign in...');
      setAutoLoginAttempted(true);
      
      try {
        const { data, error } = await auth.signIn(autoLoginEmail, autoLoginPassword);
        if (error) {
          console.error('Auto-login failed:', error.message);
        } else {
          console.log('Auto-login successful');
          // Remove the autoLogin parameter from URL for security
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('autoLogin');
          newUrl.searchParams.delete('demo');
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (error) {
        console.error('Auto-login error:', error);
      }
    };

    // Get initial session with retry logic
    const getInitialSession = async () => {
      try {
        console.log('AuthContext: Getting initial session, attempt:', retryCount + 1);
        
        const { data: { session }, error } = await auth.getCurrentSession();
        
        if (error) {
          console.error('AuthContext: Error getting session:', error);
          throw error;
        }

        if (mounted) {
          console.log('AuthContext: Session retrieved successfully');
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          // If no session, try auto-login
          if (!session) {
            checkAutoLogin();
          }
        }
      } catch (error) {
        console.error('AuthContext: Session retrieval failed:', error);
        
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          console.log(`AuthContext: Retrying in 1 second... (${retryCount}/${maxRetries})`);
          setTimeout(getInitialSession, 1000);
        } else if (mounted) {
          console.log('AuthContext: Max retries reached, setting loading to false');
          setLoading(false);
          
          // If no session after retries, try auto-login
          checkAutoLogin();
        }
      }
    };

    // Start the process
    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('AuthContext: Auth state changed:', event, session?.user?.email);
        console.log('AuthContext: Session data:', session ? 'exists' : 'none');
        console.log('AuthContext: User data:', session?.user ? 'exists' : 'none');
        console.log('AuthContext: Event details:', { event, userId: session?.user?.id, email: session?.user?.email });
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Cleanup function
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    try {
      console.log('AuthContext: Calling auth.signUp with email:', email)
      const { data, error } = await auth.signUp(email, password)
      console.log('AuthContext: signUp response:', { data, error })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('AuthContext: signUp error:', error)
      return { data: null, error }
    }
  }

  const signIn = async (email, password) => {
    try {
      const { data, error } = await auth.signIn(email, password)
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      console.log('Signing out...')
      const { error } = await auth.signOut()
      if (error) throw error
      
      // Force clear state immediately
      setUser(null)
      setSession(null)
      
      console.log('Sign out successful')
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error }
    }
  }

  const resetPassword = async (email) => {
    try {
      console.log('AuthContext: Calling auth.resetPassword with email:', email)
      const { data, error } = await auth.resetPassword(email)
      console.log('AuthContext: resetPassword response:', { data, error })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('AuthContext: resetPassword error:', error)
      return { data: null, error }
    }
  }

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
} 