-- Fix "Database error saving new user" (code: unexpected_failure)
-- Ensure a profile row is created when a new user signs up. If a trigger already exists
-- and fails (e.g. missing column or constraint), this replaces it with a minimal safe trigger.
-- Run in Supabase SQL Editor with service_role if the migration runner cannot create triggers on auth.users.

-- 1. Create trigger function: insert one row into public.profiles on auth.users INSERT
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, email)
  VALUES (NEW.id, 'parent', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If profiles has no email column or other schema difference, fallback to minimal insert
    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, 'parent')
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Drop existing trigger if present (avoid duplicate or broken trigger)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- 3. Create trigger on auth.users (may require running as superuser in SQL Editor)
DO $$
BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
  RAISE NOTICE 'Trigger on_auth_user_created created on auth.users';
EXCEPTION
  WHEN insufficient_privilege OR OTHERS THEN
    RAISE WARNING 'Could not create trigger on auth.users. Run the following in Supabase SQL Editor (Dashboard): CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();';
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'Creates a row in public.profiles when a new user signs up (auth.users INSERT). Fixes "Database error saving new user".';
