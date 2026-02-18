-- Grant table permissions for academic year holiday settings (GET academic year, save, etc.)
-- Fixes: permission denied for table academic_year_holiday_settings (42501)
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_holiday_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_year_holiday_settings TO authenticated;
