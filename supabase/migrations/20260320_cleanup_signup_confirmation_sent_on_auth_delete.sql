-- When an auth user is deleted (from Family Settings "Erase Personal Data", Supabase dashboard, or Admin API),
-- remove their email from signup_confirmation_sent so they can sign up again and see a fresh flow.
-- Run in Supabase SQL Editor with service_role if the migration runner cannot create triggers on auth.users.

-- 1. Trigger function: delete from public.signup_confirmation_sent where email = deleted user's email
CREATE OR REPLACE FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.signup_confirmation_sent
  WHERE email = lower(trim(OLD.email));
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete IS 'Removes signup_confirmation_sent rows for the deleted auth user so they can sign up again without seeing "Confirmation sent on...".';

-- 2. Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_cleanup_signup_confirmation_sent_on_auth_delete ON auth.users;

-- 3. Create trigger on auth.users (may require running in SQL Editor if migration lacks permission)
DO $$
BEGIN
  CREATE TRIGGER trigger_cleanup_signup_confirmation_sent_on_auth_delete
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete();
  RAISE NOTICE 'Trigger trigger_cleanup_signup_confirmation_sent_on_auth_delete created on auth.users';
EXCEPTION
  WHEN insufficient_privilege OR OTHERS THEN
    RAISE WARNING 'Could not create trigger on auth.users. Run in Supabase SQL Editor: CREATE TRIGGER trigger_cleanup_signup_confirmation_sent_on_auth_delete AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete();';
END;
$$;
