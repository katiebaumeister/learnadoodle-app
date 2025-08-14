import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase credentials
// You can find these in your Supabase project settings
const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable auto refresh of tokens
    autoRefreshToken: true,
    // Persist session in storage
    persistSession: true,
    // Detect session in URL (disable for mobile apps)
    detectSessionInUrl: false,
    // Storage key for web
    storageKey: 'supabase-auth',
    // Storage for web (localStorage)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
})

// Auth helper functions
export const auth = {
  // Sign up with email and password
  signUp: async (email, password) => {
    console.log('Supabase: Calling signUp with email:', email)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    console.log('Supabase: signUp response:', { data, error })
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

  // Reset password
  resetPassword: async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
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