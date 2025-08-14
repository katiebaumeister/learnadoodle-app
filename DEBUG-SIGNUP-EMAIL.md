# Debugging Signup Email Issues

## Problem
The signup process is failing with "Database error saving new user" and no confirmation email is being sent.

## Root Cause Analysis

### 1. Database Error
The error "Database error saving new user" suggests that:
- The profiles table has issues
- Foreign key constraints are failing
- The trigger function is causing problems

### 2. Email Not Sent
Even if the database error is fixed, emails might not be sent due to:
- Supabase email configuration issues
- Email provider settings
- Domain verification problems

## Solutions

### Step 1: Fix Database Issues

Run the `fix-profiles-table.sql` script in your Supabase SQL editor:

```sql
-- Copy and paste the contents of fix-profiles-table.sql
```

This will:
- Recreate the profiles table cleanly
- Fix the trigger function
- Remove problematic foreign key constraints
- Grant proper permissions

### Step 2: Check Supabase Email Settings

1. **Go to your Supabase Dashboard**
2. **Navigate to Authentication > Settings**
3. **Check Email Settings:**
   - Ensure "Enable email confirmations" is ON
   - Verify "Enable email change confirmations" is ON
   - Check "Enable secure email change" is ON

4. **Check SMTP Settings:**
   - Go to Settings > API
   - Look for SMTP configuration
   - Ensure SMTP is properly configured

### Step 3: Test Email Configuration

1. **Test with a real email address** (not example.com)
2. **Check spam/junk folders**
3. **Verify email domain is not blocked**

### Step 4: Alternative Solutions

If emails still don't work:

1. **Temporarily disable email confirmation:**
   - Go to Authentication > Settings
   - Turn OFF "Enable email confirmations"
   - Users can sign up and sign in immediately

2. **Use a different email provider:**
   - Configure SendGrid, Mailgun, or other SMTP providers
   - Update Supabase SMTP settings

3. **Check Supabase logs:**
   - Go to Logs > Auth
   - Look for email-related errors

## Testing

After applying fixes:

1. **Run the test script:**
   ```bash
   node test-signup-email.js
   ```

2. **Try signing up in the app** with a real email address

3. **Check console logs** for detailed error messages

## Expected Behavior

After fixes:
- ✅ Signup should complete without database errors
- ✅ User should be created in auth.users table
- ✅ Profile should be created in profiles table
- ✅ Confirmation email should be sent (if enabled)
- ✅ User should be able to sign in (after email confirmation)

## Common Issues

1. **Foreign Key Constraints:** The profiles table might have FK constraints that fail
2. **RLS Policies:** Row Level Security might block profile creation
3. **Trigger Errors:** The handle_new_user trigger might have syntax errors
4. **Email Provider:** Supabase's default email provider might be down
5. **Domain Issues:** Some email domains might be blocked or filtered

## Next Steps

1. Run the fix-profiles-table.sql script
2. Test signup with a real email address
3. Check Supabase email settings
4. Monitor logs for any remaining errors 