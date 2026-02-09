-- Migration: Sync Email from auth.users to profiles table
-- This provides a function to manually sync email and optionally creates a trigger
-- Note: Creating triggers on auth.users requires admin/service_role permissions
-- If you get permission errors, use the manual sync function from your application

-- ============================================================
-- 1. Create function to sync email from auth.users to profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_user_email_to_profile()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Update the email in profiles table when email changes in auth.users
  -- Only update if the email has actually changed
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET 
      email = NEW.email,
      updated_at = now()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.sync_user_email_to_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_email_to_profile() TO service_role;

COMMENT ON FUNCTION public.sync_user_email_to_profile IS 'Syncs email from auth.users to profiles table when email is updated';

-- ============================================================
-- 2. Create a manual sync function that can be called from the app
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_current_user_email()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Get the current authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Get the email from auth.users
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;
  
  -- Update the profile email
  UPDATE public.profiles
  SET 
    email = v_user_email,
    updated_at = now()
  WHERE id = v_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.sync_current_user_email() TO authenticated;

COMMENT ON FUNCTION public.sync_current_user_email IS 'Manually syncs the current user email from auth.users to profiles table';

-- ============================================================
-- 3. Try to create trigger on auth.users (requires admin permissions)
-- ============================================================

-- Note: This will fail if you don't have admin/service_role permissions
-- If it fails, you can use the manual sync function from your application
-- or set up a Supabase webhook to call sync_current_user_email() after email verification

DO $$
BEGIN
  -- Drop existing trigger if it exists
  DROP TRIGGER IF EXISTS sync_email_to_profiles_trigger ON auth.users;
  
  -- Try to create trigger (will fail silently if no permissions)
  BEGIN
    CREATE TRIGGER sync_email_to_profiles_trigger
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW
      WHEN (NEW.email IS DISTINCT FROM OLD.email)
      EXECUTE FUNCTION public.sync_user_email_to_profile();
    
    RAISE NOTICE 'Trigger created successfully on auth.users';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Could not create trigger on auth.users - insufficient permissions. Use manual sync function instead.';
    WHEN OTHERS THEN
      RAISE WARNING 'Could not create trigger on auth.users: %', SQLERRM;
  END;
END $$;

-- ============================================================
-- 3. Backfill: Sync existing emails from auth.users to profiles
-- ============================================================

-- Update all existing profiles with their current email from auth.users
UPDATE public.profiles p
SET 
  email = u.email,
  updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS DISTINCT FROM u.email OR p.email IS NULL);

-- ============================================================
-- 4. Verify the setup
-- ============================================================

-- Check that trigger was created
SELECT 
  'Trigger created successfully' as status,
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname = 'sync_email_to_profiles_trigger';

-- Check that function was created
SELECT 
  'Function created successfully' as status,
  proname as function_name
FROM pg_proc
WHERE proname = 'sync_user_email_to_profile';
