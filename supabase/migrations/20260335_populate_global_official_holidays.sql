-- Populate global_official_holidays with U.S. federal public holidays
-- Used by: CalendarPlanning, Plan Year holiday picker (fallback when Nager.Date API fails)

-- Ensure table exists (create if missing, e.g. fresh Supabase project)
CREATE TABLE IF NOT EXISTS global_official_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text,
  holiday_name text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_global_official_holidays_holiday_date ON global_official_holidays(holiday_date);

-- Add name/holiday_name columns if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'global_official_holidays' AND column_name = 'name') THEN
    ALTER TABLE global_official_holidays ADD COLUMN name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'global_official_holidays' AND column_name = 'holiday_name') THEN
    ALTER TABLE global_official_holidays ADD COLUMN holiday_name text;
  END IF;
END $$;

-- Sync name/holiday_name for existing rows that might have only one column
UPDATE global_official_holidays SET name = COALESCE(name, holiday_name) WHERE name IS NULL AND holiday_name IS NOT NULL;
UPDATE global_official_holidays SET holiday_name = COALESCE(holiday_name, name) WHERE holiday_name IS NULL AND name IS NOT NULL;

-- Insert U.S. federal public holidays 2024-2028 (skip if date already exists)
INSERT INTO global_official_holidays (holiday_date, name, holiday_name)
SELECT d, n, n FROM (VALUES
  ('2024-01-01'::date, 'New Year''s Day'),
  ('2024-01-15'::date, 'Martin Luther King Jr. Day'),
  ('2024-02-19'::date, 'Presidents'' Day'),
  ('2024-05-27'::date, 'Memorial Day'),
  ('2024-06-19'::date, 'Juneteenth'),
  ('2024-07-04'::date, 'Independence Day'),
  ('2024-09-02'::date, 'Labor Day'),
  ('2024-11-11'::date, 'Veterans Day'),
  ('2024-11-28'::date, 'Thanksgiving Day'),
  ('2024-12-25'::date, 'Christmas Day'),
  ('2025-01-01'::date, 'New Year''s Day'),
  ('2025-01-20'::date, 'Martin Luther King Jr. Day'),
  ('2025-02-17'::date, 'Presidents'' Day'),
  ('2025-05-26'::date, 'Memorial Day'),
  ('2025-06-19'::date, 'Juneteenth'),
  ('2025-07-04'::date, 'Independence Day'),
  ('2025-09-01'::date, 'Labor Day'),
  ('2025-11-11'::date, 'Veterans Day'),
  ('2025-11-27'::date, 'Thanksgiving Day'),
  ('2025-12-25'::date, 'Christmas Day'),
  ('2026-01-01'::date, 'New Year''s Day'),
  ('2026-01-19'::date, 'Martin Luther King Jr. Day'),
  ('2026-02-16'::date, 'Presidents'' Day'),
  ('2026-05-25'::date, 'Memorial Day'),
  ('2026-06-19'::date, 'Juneteenth'),
  ('2026-07-04'::date, 'Independence Day'),
  ('2026-09-07'::date, 'Labor Day'),
  ('2026-11-11'::date, 'Veterans Day'),
  ('2026-11-26'::date, 'Thanksgiving Day'),
  ('2026-12-25'::date, 'Christmas Day'),
  ('2027-01-01'::date, 'New Year''s Day'),
  ('2027-01-18'::date, 'Martin Luther King Jr. Day'),
  ('2027-02-15'::date, 'Presidents'' Day'),
  ('2027-05-31'::date, 'Memorial Day'),
  ('2027-06-19'::date, 'Juneteenth'),
  ('2027-07-04'::date, 'Independence Day'),
  ('2027-09-06'::date, 'Labor Day'),
  ('2027-11-11'::date, 'Veterans Day'),
  ('2027-11-25'::date, 'Thanksgiving Day'),
  ('2027-12-25'::date, 'Christmas Day'),
  ('2028-01-01'::date, 'New Year''s Day'),
  ('2028-01-17'::date, 'Martin Luther King Jr. Day'),
  ('2028-02-21'::date, 'Presidents'' Day'),
  ('2028-05-29'::date, 'Memorial Day'),
  ('2028-06-19'::date, 'Juneteenth'),
  ('2028-07-04'::date, 'Independence Day'),
  ('2028-09-04'::date, 'Labor Day'),
  ('2028-11-11'::date, 'Veterans Day'),
  ('2028-11-23'::date, 'Thanksgiving Day'),
  ('2028-12-25'::date, 'Christmas Day')
) AS v(d, n)
WHERE NOT EXISTS (SELECT 1 FROM global_official_holidays g WHERE g.holiday_date = v.d);
