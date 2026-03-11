import { createClient } from '@supabase/supabase-js'

// Get Supabase credentials from environment variables
// For React: REACT_APP_ prefix is required
// For Expo: EXPO_PUBLIC_ prefix is required
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 
                    process.env.EXPO_PUBLIC_SUPABASE_URL || 
                    'https://mtftwebrtazhyzmmvmdl.supabase.co' // Fallback for development
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 
                        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw' // Fallback for development

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found in environment variables. Using fallback values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable auto refresh of tokens
    autoRefreshToken: true,
    // Persist session in storage
    persistSession: true,
    // Detect session in URL - enables automatic hash processing for email confirmation redirects
    detectSessionInUrl: typeof window !== 'undefined',
    // Storage key for web
    storageKey: 'supabase-auth',
    // Storage for web (localStorage)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  },
  global: {
    // Add timeout for all requests (20 seconds)
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });
    },
  },
})

// Expose supabase globally for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.__SUPABASE__ = supabase;
  window.__SUPABASE_URL__ = supabaseUrl;
  window.__SUPABASE_ANON_KEY__ = supabaseAnonKey;
}

// Auth helper functions
export const auth = {
  // Sign up with email and password.
  // options.emailRedirectTo: where to send the user after email confirmation (e.g. app origin).
  signUp: async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: options.emailRedirectTo,
      },
    })
    return { data, error }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  getCurrentUser: () => {
    return supabase.auth.getUser()
  },

  // Get current session
  getCurrentSession: () => {
    return supabase.auth.getSession()
  },

  // Listen to auth state changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  },

  // Reset password. options.redirectTo: URL to land on after reset (e.g. app reset-password page).
  resetPassword: async (email, options = {}) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: options.redirectTo,
    })
    return { data, error }
  },

  // Update password
  updatePassword: async (password) => {
    const { data, error } = await supabase.auth.updateUser({
      password: password
    })
    return { data, error }
  }
} 