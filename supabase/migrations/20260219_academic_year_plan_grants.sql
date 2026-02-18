-- Grant table permissions for Plan Year / apply_to_calendar (backend uses service_role)
-- Fixes: permission denied for table academic_years (42501)
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_years TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_years TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_plan TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_plan TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_exclusions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_exclusions TO authenticated;
