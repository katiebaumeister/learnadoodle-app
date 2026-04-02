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

    const handleOAuthCallback = async () => {
      if (typeof window === 'undefined') return false;
      const url = new URL(window.location.href);
      const pathname = url.pathname.replace(/\/$/, '') || '/';
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        if (mounted) {
          setLoading(false);
        }
        return false;
      }

      if (!code || typeof auth.exchangeCodeForSession !== 'function') {
        return false;
      }

      try {
        const { data, error: exchangeError } = await auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        if (mounted) {
          setSession(data?.session ?? null);
          setUser(data?.session?.user ?? null);
          setLoading(false);
        }

        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        const hasInvite = url.searchParams.has('invite');
        const shouldRouteToHome = !hasInvite && (pathname === '/' || pathname === '/login' || pathname === '/signup');

        if (shouldRouteToHome) {
          const nextUrl = new URL(`${url.origin}/home`);
          window.history.replaceState({}, '', nextUrl.toString());
          window.dispatchEvent(new PopStateEvent('popstate'));
          return true;
        }

        window.history.replaceState({}, '', url.toString());
        window.dispatchEvent(new PopStateEvent('popstate'));
        return true;
      } catch (_) {
        if (mounted) {
          setLoading(false);
        }
        return false;
      }
    };

    // Get initial session with retry logic
    const getInitialSession = async () => {
      try {
        const handledOAuth = await handleOAuthCallback();
        if (handledOAuth) return;

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
          const delayMs = 250 * retryCount;
          setTimeout(getInitialSession, delayMs);
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

  const signUp = async (email, password, options = {}) => {
    try {
      const siteUrl = typeof window !== 'undefined'
        ? (process.env.REACT_APP_SITE_URL || process.env.EXPO_PUBLIC_SITE_URL || window.location.origin)
        : (process.env.REACT_APP_SITE_URL || process.env.EXPO_PUBLIC_SITE_URL || '')
      const { data, error } = await auth.signUp(email, password, {
        emailRedirectTo: options.emailRedirectTo || siteUrl || undefined,
      })
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

  const signInWithGoogle = async (options = {}) => {
    try {
      const redirectTo = options.redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined)
      const { data, error } = await auth.signInWithGoogle({ redirectTo })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await auth.signOut()
      if (error) {
        const msg = (error.message || '').toLowerCase()
        if (msg.includes('not exist') || error.code === 'user_not_found') {
          await auth.signOutLocal()
          setUser(null)
          setSession(null)
          return { error: null }
        }
        throw error
      }
      setUser(null)
      setSession(null)
      return { error: null }
    } catch (error) {
      try {
        await auth.signOutLocal()
        setUser(null)
        setSession(null)
      } catch (_) {}
      return { error }
    }
  }

  /** After account deletion the Auth user is gone; server signOut returns 403. Clear storage only. */
  const signOutLocal = async () => {
    try {
      await auth.signOutLocal()
    } catch (_) {}
    setUser(null)
    setSession(null)
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
    return { error: null }
  }

  const resetPassword = async (email, options = {}) => {
    try {
      const { data, error } = await auth.resetPassword(email, options)
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
    signInWithGoogle,
    signOut,
    signOutLocal,
    resetPassword,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
} 