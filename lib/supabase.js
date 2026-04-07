import { createClient } from '@supabase/supabase-js'

// Get Supabase credentials from environment variables
// For React: REACT_APP_ prefix is required
// For Expo: EXPO_PUBLIC_ prefix is required
const _envUrl = process.env.REACT_APP_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const _envKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL_FALLBACK = 'https://mtftwebrtazhyzmmvmdl.supabase.co';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw';

const supabaseUrl = (_envUrl && _envUrl.trim()) ? _envUrl : SUPABASE_URL_FALLBACK;
const supabaseAnonKey = (_envKey && _envKey.trim()) ? _envKey : SUPABASE_ANON_KEY_FALLBACK;

if (!_envUrl?.trim() || !_envKey?.trim()) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Supabase] Using fallback URL/key. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY (or EXPO_PUBLIC_*) in production.');
  }
}

// Pointing SUPABASE_URL at the app API (e.g. localhost:8001) breaks REST — PostgREST then returns "No API key found"
if (
  typeof supabaseUrl === 'string' &&
  /localhost:80\d{2}/.test(supabaseUrl) &&
  !supabaseUrl.includes('54321')
) {
  console.error(
    '[Supabase] REACT_APP_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL looks like your app API, not Supabase. ' +
      'Use your project URL (https://<ref>.supabase.co). Local API is for /api/* only; the JS client must talk to Supabase directly.'
  );
}

/**
 * Ensures apikey is present on Supabase REST calls. Custom fetch + some bundlers can drop Headers
 * so PostgREST responds with: "No API key found in request".
 * Supabase-js may pass relative URLs (/rest/v1/...); those must not use startsWith(supabaseUrl).
 */
function createSupabaseFetch() {
  let supabaseHostname = '';
  try {
    supabaseHostname = new URL(supabaseUrl).hostname;
  } catch (_) {
    supabaseHostname = '';
  }

  return (input, init = {}) => {
    const options = init && typeof init === 'object' ? { ...init } : {};
    // Honor upstream abort (OAuth redirect, tab close, Supabase cancelling stale REST calls).
    let externalSignal = options.signal;
    if (typeof Request !== 'undefined' && input instanceof Request && input.signal) {
      externalSignal = externalSignal || input.signal;
    }

    const combined = new AbortController();
    const timeoutId = setTimeout(() => combined.abort(), 20000);
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        return Promise.reject(
          typeof DOMException !== 'undefined'
            ? new DOMException('The operation was aborted.', 'AbortError')
            : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
        );
      }
      externalSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        combined.abort();
      });
    }

    // Supabase-js may pass a string, URL, or Request. Missing URL/href handling left urlString
    // empty so we never set apikey → PostgREST: "No API key found in request".
    let urlString = '';
    if (typeof input === 'string') {
      urlString = input;
    } else if (typeof URL !== 'undefined' && input instanceof URL) {
      urlString = input.href;
    } else if (input && typeof input.url === 'string') {
      urlString = input.url;
    }

    let headers;
    try {
      headers = new Headers(options.headers);
    } catch {
      headers = new Headers();
    }

    let requestHostname = '';
    try {
      if (urlString) {
        requestHostname = new URL(urlString, supabaseUrl).hostname;
      }
    } catch (_) {
      requestHostname = '';
    }

    const existingKey = (headers.get('apikey') || '').trim();
    const isOurSupabaseProject =
      supabaseAnonKey &&
      supabaseHostname &&
      requestHostname &&
      requestHostname === supabaseHostname;

    if (isOurSupabaseProject && !existingKey) {
      headers.set('apikey', supabaseAnonKey);
    }

    return fetch(input, {
      ...options,
      headers,
      signal: combined.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable auto refresh of tokens
    autoRefreshToken: true,
    // Persist session in storage
    persistSession: true,
    // Detect session in URL disabled - we manually process in SetPasswordPage to avoid Supabase redirecting away from /set-password
    detectSessionInUrl: false,
    // Storage key for web
    storageKey: 'supabase-auth',
    // Storage for web (localStorage)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  },
  global: {
    // Timeout + guaranteed apikey on REST (avoids empty/missing header issues)
    fetch: createSupabaseFetch(),
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

  signInWithGoogle: async (options = {}) => {
    const redirectTo = options.redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })
    return { data, error }
  },

  // Sign out (invalidates session on server; fails if user was already deleted)
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Clear session locally only — use after account deletion (user no longer exists in Auth)
  signOutLocal: async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
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

  exchangeCodeForSession: async (code) => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    return { data, error }
  },

  setSession: async ({ access_token, refresh_token }) => {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    return { data, error }
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
  },

  resendSignupEmail: async (email) => {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })
    return { data, error }
  },
} 