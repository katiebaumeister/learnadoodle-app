-- Allow backend (service_role) to create family rows for new signups (POST /api/onboarding/ensure_family).
-- Without this, ensure_family can return 500 when inserting into family.
GRANT INSERT ON family TO service_role;
-- Ensure full access for backend onboarding flow
GRANT SELECT, UPDATE, DELETE ON family TO service_role;
