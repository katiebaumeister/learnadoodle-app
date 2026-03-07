-- Store when we sent a sign-up confirmation email so we can show
-- "Confirmation sent on [day/time]. Please check your email!" if the user tries again.
-- Backend uses service_role to insert/select (RLS blocks anon/authenticated).

CREATE TABLE IF NOT EXISTS public.signup_confirmation_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_confirmation_sent_email_sent_at
  ON public.signup_confirmation_sent (email, sent_at DESC);

COMMENT ON TABLE public.signup_confirmation_sent IS 'Tracks when sign-up confirmation email was sent per email; used to show friendly message on repeat sign-up.';

ALTER TABLE public.signup_confirmation_sent ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (backend uses service role; anon/authenticated get no access)
CREATE POLICY "signup_confirmation_sent_service_role_only"
  ON public.signup_confirmation_sent
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
