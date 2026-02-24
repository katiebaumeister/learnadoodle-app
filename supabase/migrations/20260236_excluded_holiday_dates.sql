-- Allow excluding specific public holidays per academic year (e.g. uncheck Lincoln's Birthday)
ALTER TABLE academic_year_holiday_settings
  ADD COLUMN IF NOT EXISTS excluded_holiday_dates JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN academic_year_holiday_settings.excluded_holiday_dates IS 'Array of date strings (YYYY-MM-DD) to exclude from global holidays for this year.';
