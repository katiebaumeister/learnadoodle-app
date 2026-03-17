-- Used by backend GET /api/auth/signup-confirmation-sent: if the email has no user in auth (e.g. account was deleted),
-- we return sent_at = null so the UI treats it as fresh and allows sending a new confirmation.
-- Requires SECURITY DEFINER to read auth.users.
CREATE OR REPLACE FUNCTION public.auth_user_exists_by_email(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1);
$$;

COMMENT ON FUNCTION public.auth_user_exists_by_email IS 'Returns true if auth.users has a row with the given email (used to ignore stale signup_confirmation_sent after account deletion).';

GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO anon;
