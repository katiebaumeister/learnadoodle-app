# Supabase Authentication Setup Guide

This guide explains how Supabase authentication is configured in this project and how to use it.

## Overview

Your project already has Supabase authentication set up with:
- **Frontend**: React/Expo client with auth helpers
- **Backend**: FastAPI middleware for token validation
- **Auth Context**: React context for managing auth state

## 1. Getting Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for frontend)
   - **service_role key** (for backend only - never expose to frontend)

## 2. Frontend Configuration

### For Expo Projects (This Project)

Create a `.env` file in the `hi-world-app` directory:

```bash
# Supabase Configuration (Frontend)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important Notes:**
- Use `EXPO_PUBLIC_` prefix for Expo projects
- Only use the **anon key** in the frontend (never the service_role key)
- The `.env` file should be in `.gitignore` (already configured)

### Environment Variable Setup

1. Create `.env` file:
   ```bash
   cd hi-world-app
   touch .env
   ```

2. Add your credentials:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://mtftwebrtazhyzmmvmdl.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. Restart your development server:
   ```bash
   npm start
   # or
   expo start
   ```

## 3. Backend Configuration

The backend uses environment variables from `hi-world-app/backend/.env`:

```bash
# Supabase Configuration (Backend)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Important:**
- Use the **service_role key** (bypasses RLS)
- Never expose this key to the frontend
- See `backend/SETUP_ENV.md` for detailed backend setup

## 4. How Authentication Works

### Frontend Flow

1. **Client Setup** (`lib/supabase.js`):
   - Creates Supabase client with auth configuration
   - Provides helper functions for auth operations

2. **Auth Context** (`contexts/AuthContext.js`):
   - Manages user state globally
   - Provides `useAuth()` hook for components
   - Handles session persistence and auto-refresh

3. **App Integration** (`App.js`):
   - Wraps app with `AuthProvider`
   - Shows auth screen when user is not logged in

### Using Authentication in Components

```javascript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <LoginScreen />;

  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

### Direct Supabase Auth Usage

```javascript
import { supabase, auth } from '../lib/supabase';

// Sign up
const { data, error } = await auth.signUp(email, password);

// Sign in
const { data, error } = await auth.signIn(email, password);

// Sign out
const { error } = await auth.signOut();

// Get current user
const { data: { user } } = await auth.getCurrentUser();

// Listen to auth changes
auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);
  console.log('Session:', session);
});
```

## 5. Backend Authentication

The backend validates tokens from frontend requests:

```python
from backend.auth import get_current_user

@app.get("/protected")
async def protected_route(user: dict = Depends(get_current_user)):
    # user contains: {"id": "...", "email": "..."}
    return {"message": f"Hello {user['email']}"}
```

### How Backend Auth Works

1. Frontend sends requests with `Authorization: Bearer <token>` header
2. Backend extracts token from header or cookies
3. Backend validates token with Supabase
4. Returns user info or 401 if invalid

### Making Authenticated Requests from Frontend

```javascript
import { supabase } from '../lib/supabase';

// Get the session token
const { data: { session } } = await supabase.auth.getSession();

// Include in API requests
fetch('http://localhost:8000/api/protected', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
```

## 6. Available Auth Methods

### Email/Password
- ✅ Sign up: `auth.signUp(email, password)`
- ✅ Sign in: `auth.signIn(email, password)`
- ✅ Sign out: `auth.signOut()`
- ✅ Reset password: `auth.resetPassword(email)`
- ✅ Update password: `auth.updatePassword(newPassword)`

### OAuth Providers (Can be added)
Supabase supports OAuth with:
- Google
- GitHub
- Apple
- Azure
- And more...

To add OAuth, configure in Supabase Dashboard → Authentication → Providers

## 7. Row Level Security (RLS)

Supabase uses RLS policies to secure data. Your backend uses the service_role key to bypass RLS for admin operations.

**Frontend queries** automatically use the user's session token, so RLS policies apply automatically.

## 8. Testing Authentication

### Test Sign Up
```javascript
const { data, error } = await auth.signUp('test@example.com', 'password123');
console.log('User:', data.user);
console.log('Error:', error);
```

### Test Sign In
```javascript
const { data, error } = await auth.signIn('test@example.com', 'password123');
if (error) {
  console.error('Sign in failed:', error.message);
} else {
  console.log('Signed in:', data.user);
}
```

### Check Current Session
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);
```

## 9. Troubleshooting

### CORS Errors (Most Common Issue)

**Error:** `Fetch API cannot load https://mtftwebrtazhyzmmvmdl.supabase.co/auth/v1/signup due to access control checks.`

**Solution:** Add your frontend domain to Supabase's allowed origins:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**
4. Scroll to **CORS Configuration** or **Allowed Origins**
5. Add your frontend URLs:
   - For local development: `http://localhost:19006`, `http://localhost:3000`, etc.
   - For production: `https://your-domain.com`
6. Click **Save**

**Important:**
- Add ALL domains/ports you use (localhost:19006, localhost:3000, etc.)
- Include both `http://` and `https://` versions if needed
- For localhost, you may need to add: `http://localhost:*` or each port individually
- Changes take effect immediately (no restart needed)

**Alternative:** If you can't find CORS settings in API settings, check:
- **Authentication** → **URL Configuration** → **Site URL** and **Redirect URLs**
- Some Supabase projects have CORS settings in **Project Settings** → **General**

### "Missing access token" error
- Ensure you're sending the `Authorization` header
- Check that the session is valid: `await supabase.auth.getSession()`

### Environment variables not working
- For Expo: Use `EXPO_PUBLIC_` prefix
- Restart the development server after changing `.env`
- Check that `.env` is in the correct directory

### Backend auth fails
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `backend/.env`
- Check that the token is being sent in the request
- Enable debug logging: `LOG_LEVEL=debug` in backend `.env`

### 401 Unauthorized Errors
If you see 401 errors for Supabase REST API calls:
- Check that the user is authenticated: `await supabase.auth.getSession()`
- Verify RLS policies allow the authenticated user to access the data
- Ensure the session token is being sent with requests
- Check browser console for expired token errors

## 10. Security Best Practices

1. ✅ **Never commit `.env` files** - Already in `.gitignore`
2. ✅ **Use anon key in frontend** - Service role key only in backend
3. ✅ **Enable RLS policies** - Protect your data at the database level
4. ✅ **Validate tokens in backend** - Always verify tokens server-side
5. ✅ **Use HTTPS in production** - Never send tokens over HTTP

## 11. Next Steps

- Configure email templates in Supabase Dashboard → Authentication → Email Templates
- Set up password reset redirect URLs
- Configure OAuth providers if needed
- Review and adjust RLS policies for your tables

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/auth-api)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
