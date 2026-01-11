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
        return;
      }

      setAutoLoginAttempted(true);
      
      try {
        const { data, error } = await auth.signIn(autoLoginEmail, autoLoginPassword);
        if (error) {
        } else {
          // Remove the autoLogin parameter from URL for security
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('autoLogin');
          newUrl.searchParams.delete('demo');
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (error) {
      }
    };

    // Get initial session with retry logic
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await auth.getCurrentSession();
        
        if (error) {
          throw error;
        }

        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          // If no session, try auto-login
          if (!session) {
            checkAutoLogin();
          }
        }
      } catch (error) {
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          
          setTimeout(getInitialSession, 1000);
        } else if (mounted) {
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
      const { data, error } = await auth.signUp(email, password)
      if (error) throw error
      return { data, error: null }
    } catch (error) {
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
      const { error } = await auth.signOut()
      if (error) throw error
      
      // Force clear state immediately
      setUser(null)
      setSession(null)
      
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const resetPassword = async (email) => {
    try {
      const { data, error } = await auth.resetPassword(email)
      if (error) throw error
      return { data, error: null }
    } catch (error) {
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