-- Allow service_role to delete profiles (required for account deletion flow).
-- Account deletion: backend deletes family (CASCADE) then profiles for all family members, then auth users via Admin API.
GRANT DELETE ON profiles TO service_role;
