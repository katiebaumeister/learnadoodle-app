# Debug Reset Password Functionality

## Current Issue
Reset password is not working - no confirmation popup and no email sent.

## Debugging Steps

### 1. Check Console Logs
With the updated code, you should now see detailed console logs:
- "Attempting to reset password for email: [email]"
- "Calling resetPassword function..."
- "AuthContext: Calling auth.resetPassword with email: [email]"
- "AuthContext: resetPassword response: [data/error]"

### 2. Test Direct Supabase Call
In browser console, try:
```javascript
// Import supabase directly
import { supabase } from './lib/supabase.js'

// Test reset password
const { data, error } = await supabase.auth.resetPasswordForEmail('your-email@example.com')
console.log({ data, error })
```

### 3. Check Supabase Project Settings

#### A. Authentication Settings
1. Go to Supabase Dashboard
2. Navigate to Authentication > Settings
3. Check:
   - **Site URL**: Should be set to your app URL
   - **Redirect URLs**: Should include your app URL + `/auth/callback`

#### B. Email Settings
1. Go to Authentication > Email Templates
2. Check if "Reset Password" template exists
3. Verify email provider is configured

#### C. SMTP Settings (if using custom email)
1. Go to Authentication > Settings > SMTP
2. Verify SMTP settings are correct

### 4. Common Issues & Solutions

#### Issue: "Site URL not configured"
**Solution**: Set Site URL in Authentication > Settings

#### Issue: "Email provider not configured"
**Solution**: Configure email provider in Authentication > Settings

#### Issue: "Redirect URL not allowed"
**Solution**: Add redirect URL to Authentication > Settings > Redirect URLs

#### Issue: "Rate limiting"
**Solution**: Wait a few minutes before trying again

### 5. Test with Different Email
Try with a different email address to rule out email-specific issues.

### 6. Check Network Tab
1. Open browser DevTools
2. Go to Network tab
3. Try reset password
4. Look for failed requests to Supabase

### 7. Verify Supabase Client
Check if supabase client is properly initialized:
```javascript
console.log('Supabase URL:', supabase.supabaseUrl)
console.log('Supabase Key:', supabase.supabaseKey ? 'Present' : 'Missing')
```

## Expected Behavior
When working correctly:
1. User enters email
2. Clicks "Send Reset Email"
3. Console shows success logs
4. Alert shows "Password reset email sent!"
5. Email is received with reset link

## Next Steps
1. Check console logs with updated code
2. Verify Supabase project settings
3. Test with direct supabase call
4. Check network requests
5. Verify email provider configuration 