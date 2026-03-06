-- Allow service_role to INSERT and UPDATE profiles (e.g. child accept-invite flow).
-- Backend uses service role to upsert profile when a child creates account via invite;
-- previously service_role had only SELECT on profiles, causing "permission denied for table profiles" (42501).

GRANT INSERT, UPDATE ON public.profiles TO service_role;

-- RLS: allow service_role to insert profiles (for new child accounts)
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);
