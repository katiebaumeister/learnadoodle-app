-- Allow backend to delete stale signup_confirmation_sent rows when the auth user was deleted
-- (GET /api/auth/signup-confirmation-sent clears old rows for that email when user no longer exists).
GRANT DELETE ON public.signup_confirmation_sent TO service_role;
GRANT DELETE ON public.signup_confirmation_sent TO authenticator;
