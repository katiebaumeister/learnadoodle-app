-- Allow backend (service role) and authenticated to INSERT/UPDATE state_requirements for seeding and admin
-- (Same pattern as 20260223, 20260231, 20260219 for other tables.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_requirements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_requirements TO authenticated;
