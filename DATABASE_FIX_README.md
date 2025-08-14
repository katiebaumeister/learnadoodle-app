# Database Permission Fix Guide

This guide will help you fix the 403 permission errors and 404 errors you're seeing in your app.

## Current Issues

1. **403 Error**: `permission denied for table activities` - Missing RLS policies
2. **404 Error**: `class_days` endpoint not found - Table might not exist or missing permissions
3. **Shadow Style Warnings**: React Native web deprecation warnings (already fixed in code)

## How to Fix

### Step 1: Run the SQL Fix Script

1. **Open your Supabase Dashboard**
   - Go to [supabase.com](https://supabase.com)
   - Sign in and select your project
   - Go to **SQL Editor**

2. **Run the fix script**
   - Copy the contents of `fix-activities-and-calendar-rls.sql`
   - Paste it into the SQL Editor
   - Click **Run** to execute

3. **What this script does**:
   - Creates the `activities` table if it doesn't exist
   - Creates the `class_days` table if it doesn't exist  
   - Creates the `holidays` table if it doesn't exist
   - Enables Row Level Security (RLS) on all tables
   - Creates proper RLS policies for user access
   - Adds necessary indexes for performance

### Step 2: Test the Fix

1. **Run the test script**:
   ```bash
   cd hi-world-app
   node test-database-permissions.js
   ```

2. **Check the output**:
   - means the table is accessible
   - means there are still permission issues

### Step 3: Verify in Your App

1. **Restart your app** (if running)
2. **Check the console** - the 403/404 errors should be gone
3. **Test the calendar view** - it should now load data properly

## What Gets Fixed

### Activities Table
- RLS policies for SELECT, INSERT, UPDATE, DELETE
- Family-based access control
- Proper indexes for performance

### Class Days Table  
- RLS policies for calendar data
- Family-year based access control
- Proper structure for calendar planning

### Holidays Table
- RLS policies for holiday data
- Family-year based access control
- Proper structure for calendar display

## Troubleshooting

### If you still get permission errors:

1. **Check your Supabase RLS settings**:
   - Go to **Authentication > Policies** in your Supabase dashboard
   - Make sure RLS is enabled on the tables
   - Verify the policies are created correctly

2. **Check your user authentication**:
   - Make sure you're logged in to the app
   - Verify your user has a profile with a family_id

3. **Check table structure**:
   - Go to **Table Editor** in Supabase
   - Verify the tables exist and have the right columns

### If tables don't exist:

1. **Run the complete schema script**:
   - Use `complete-onboarding-schema.sql` for a full setup
   - This creates all necessary tables and relationships

## Expected Results

After running the fix:

- **No more 403 errors** for activities table
- **No more 404 errors** for class_days
- **Calendar loads properly** with real data
- **Tasks load properly** from activities table
- **All RLS warnings resolved**

## Need Help?

If you're still having issues:

1. **Check the test script output** for specific error codes
2. **Verify your Supabase project settings**
3. **Make sure your environment variables are correct**
4. **Check that you're running the SQL as the correct user**

The fix script is designed to be safe and won't overwrite existing data - it only adds what's missing!
