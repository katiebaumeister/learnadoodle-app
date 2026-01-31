# Password Reset Setup Guide

## Overview

Password reset is handled entirely on the **frontend** - no backend configuration needed. However, you need to configure the **redirect URL** in Supabase so the reset link works correctly.

## The Problem

When you click the password reset link in the email, it redirects you to the sign-in screen instead of the password reset page. This happens because Supabase doesn't know where to redirect users after they click the reset link.

## Solution: Configure Redirect URL in Supabase

### Step 1: Open Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project: `mtftwebrtazhyzmmvmdl`
3. Navigate to **Authentication** → **URL Configuration**

### Step 2: Add Redirect URLs

In the **Redirect URLs** field, add your password reset URL:

**For Local Development:**
```
http://localhost:19006/reset-password
http://localhost:3000/reset-password
http://127.0.0.1:19006/reset-password
```

**For Production:**
```
https://learnadoodle.onrender.com/reset-password
https://your-domain.com/reset-password
```

**Important:**
- Include the full path: `/reset-password` (not just the domain)
- Add one URL per line
- Include both `http://` and `https://` versions if needed
- Add all domains/ports where your app runs

### Step 3: Verify Site URL

Make sure your **Site URL** is also set correctly:
- **Development:** `http://localhost:19006` or your dev URL
- **Production:** `https://learnadoodle.onrender.com` or your production URL

### Step 4: Save and Test

1. Click **Save** or **Update**
2. Request a new password reset email (the old link won't work)
3. Click the reset link in the email
4. You should now be redirected to `/reset-password` with the reset tokens

## How It Works

1. **User requests reset:** Clicks "Forgot Password" and enters email
2. **Frontend sends request:** `resetPassword(email, { redirectTo: 'http://localhost:19006/reset-password' })`
3. **Supabase sends email:** Email contains a link with reset tokens
4. **User clicks link:** Supabase redirects to your `redirectTo` URL with tokens in the hash
5. **Frontend processes:** `WebRouter` detects the tokens and shows `PasswordResetPage`
6. **User sets new password:** Password is updated via Supabase auth API

## Troubleshooting

### Reset link still goes to sign-in screen

**Check 1: Redirect URL is in Supabase**
- Go to Authentication → URL Configuration
- Verify `/reset-password` URL is in the Redirect URLs list
- Make sure it matches exactly (including protocol and port)

**Check 2: URL in email matches**
- Open the password reset email
- Check what URL the "Reset Password" button links to
- It should be something like: `https://your-domain.com/reset-password#access_token=...&type=recovery`

**Check 3: Browser console**
- Open Developer Tools → Console
- Look for any errors when clicking the reset link
- Check if tokens are in the URL hash: `window.location.hash`

**Check 4: Request a new reset email**
- Old reset links won't work after changing redirect URLs
- Request a fresh password reset email after updating Supabase settings

### Reset page shows "Verifying Reset Link..." forever

This means the tokens aren't being detected. Check:
1. URL hash contains `access_token` and `type=recovery`
2. Browser isn't blocking the hash parameters
3. Try opening the link in an incognito/private window

### "Reset Link Expired" message

- Reset links expire after a certain time (usually 1 hour)
- Request a new password reset email
- Make sure you're using the link from the most recent email

## Current Configuration

The frontend is configured to:
- Request reset with: `redirectTo: ${window.location.origin}/reset-password`
- Handle reset at: `/reset-password` route
- Process tokens from URL hash: `#access_token=...&type=recovery`

Make sure Supabase Redirect URLs match this pattern!

## Quick Test

After configuring Supabase:

1. Go to your app's sign-in page
2. Click "Forgot Password"
3. Enter your email
4. Check your email for the reset link
5. Click the link - it should take you to `/reset-password` page
6. You should see the password reset form (not the sign-in screen)
