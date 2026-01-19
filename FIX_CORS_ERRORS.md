# Fixing CORS Errors with Supabase

## Quick Fix for "Access Control Checks" Errors

If you're seeing this error:
```
Fetch API cannot load https://mtftwebrtazhyzmmvmdl.supabase.co/auth/v1/signup 
due to access control checks.
```

## Solution: Configure Allowed Origins in Supabase

### Step 1: Open Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project: `mtftwebrtazhyzmmvmdl`

### Step 2: Configure URL Configuration (This is where CORS is handled)

Since you're in the Authentication section, click on **URL Configuration**:

1. Click **URL Configuration** in the Authentication menu
2. You'll see two main fields:
   - **Site URL** - Your main application URL
   - **Redirect URLs** - All URLs that can receive auth redirects

**For CORS to work, you need to add your frontend URLs here:**

### Step 3: Configure Site URL and Redirect URLs

**Site URL:**
- Set this to your main production URL (or localhost for development)
- Example: `http://localhost:19006` or `https://learnadoodle.onrender.com`

**Redirect URLs:**
- Add ALL URLs where your app runs (one per line)
- This includes both development and production URLs
- Supabase uses these to determine which origins are allowed for CORS

**Add these URLs (one per line):**

**For Local Development:**
```
http://localhost:19006
http://localhost:3000
http://localhost:8081
http://127.0.0.1:19006
http://127.0.0.1:3000
```

**For Production:**
```
https://learnadoodle.onrender.com
```

**Important Notes:**
- Include the protocol (`http://` or `https://`)
- Include the port number for localhost URLs
- Add both `localhost` and `127.0.0.1` if you use both
- Each URL should be on its own line in the Redirect URLs field
- The Site URL should be your primary/production URL

### Step 4: Save and Test
1. Click **Save** or **Update**
2. Refresh your frontend application
3. Try signing up/signing in again

## Alternative: Check Current Domain

To see what domain your app is using:

1. Open browser Developer Tools (F12)
2. Go to **Console** tab
3. Type: `window.location.origin`
4. Copy the exact URL shown
5. Add that exact URL to Supabase allowed origins

## Still Having Issues?

### Check Browser Console
Look for the exact error message - it will tell you:
- Which domain is being blocked
- Which Supabase endpoint is failing

### Verify Supabase Project
Make sure you're configuring the correct Supabase project:
- Project URL should match: `https://mtftwebrtazhyzmmvmdl.supabase.co`

### Check Network Tab
1. Open Developer Tools → **Network** tab
2. Try to sign up/sign in
3. Look for the failed request
4. Check the **Request Headers** → **Origin** header
5. Make sure that exact origin is in Supabase allowed origins

## Common Mistakes

❌ **Wrong:** `localhost:19006` (missing protocol)
✅ **Correct:** `http://localhost:19006`

❌ **Wrong:** `http://localhost` (missing port)
✅ **Correct:** `http://localhost:19006`

❌ **Wrong:** Only adding production URL (forgetting localhost)
✅ **Correct:** Add both localhost AND production URLs

## Need Help?

If CORS settings aren't visible in your Supabase dashboard:
1. Check Supabase documentation for your project version
2. Contact Supabase support
3. Try using Supabase CLI: `supabase projects update --allowed-origins "http://localhost:19006"`
