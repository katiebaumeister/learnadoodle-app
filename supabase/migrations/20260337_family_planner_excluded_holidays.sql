-- Add excluded_holiday_dates to family_planner_settings for Planning Preferences
-- Syncs with Plan My Year: both UIs read/write this for consistency
ALTER TABLE family_planner_settings
  ADD COLUMN IF NOT EXISTS excluded_holiday_dates JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN family_planner_settings.excluded_holiday_dates IS 'YYYY-MM-DD dates to exclude from US public holidays. Synced between Planning Preferences and Plan My Year.';
