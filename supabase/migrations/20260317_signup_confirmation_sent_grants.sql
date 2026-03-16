-- Fix "permission denied for table signup_confirmation_sent" (Supabase logs).
-- The table had RLS + policy for service_role but no table-level GRANTs.
-- PostgREST connects as "authenticator"; in some setups the executing role stays authenticator.
-- Grant table-level access to both roles; add policy for authenticator so backend requests succeed.
GRANT SELECT, INSERT ON public.signup_confirmation_sent TO service_role;
GRANT SELECT, INSERT ON public.signup_confirmation_sent TO authenticator;

CREATE POLICY "signup_confirmation_sent_authenticator_all"
  ON public.signup_confirmation_sent
  FOR ALL
  TO authenticator
  USING (true)
  WITH CHECK (true);
