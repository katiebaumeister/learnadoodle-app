-- Returns whether an auth user exists for the email and whether their email is confirmed.
-- Used by GET /api/auth/signup-confirmation-sent to route confirmed accounts to sign-in.
CREATE OR REPLACE FUNCTION public.auth_user_status_by_email(p_email text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT json_build_object(
    'exists', EXISTS (
      SELECT 1 FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1
    ),
    'email_confirmed', EXISTS (
      SELECT 1
      FROM auth.users
      WHERE email = lower(trim(p_email))
        AND email_confirmed_at IS NOT NULL
      LIMIT 1
    )
  );
$$;

COMMENT ON FUNCTION public.auth_user_status_by_email IS
  'Returns {exists, email_confirmed} for the given email (used to distinguish pending signups from existing accounts).';

GRANT EXECUTE ON FUNCTION public.auth_user_status_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_status_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_status_by_email(text) TO anon;
