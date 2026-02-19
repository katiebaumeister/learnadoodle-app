-- Grant permissions on subject table so backend (service_role) and app (authenticated) can access it.
-- Fixes: permission denied for table subject (42501) when onboarding create_subject runs.

GRANT SELECT, INSERT, UPDATE, DELETE ON subject TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON subject TO authenticated;
