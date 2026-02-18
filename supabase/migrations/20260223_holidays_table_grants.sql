-- Grant table permissions for holidays (GET academic year, save, sync, etc.)
-- Fixes: permission denied for table holidays (42501)
GRANT SELECT, INSERT, UPDATE, DELETE ON holidays TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON holidays TO authenticated;
