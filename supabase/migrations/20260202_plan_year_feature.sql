-- ============================================================
-- Plan Year Feature: Academic Year Planning with Holiday Management
-- ============================================================
-- 
-- REUSE STRATEGY:
-- 1. academic_years: Created if not exists, then extended with constraint solver fields
-- 2. holidays: Created if not exists, then extended with type enum and source_id
-- 3. class_days: Created if not exists (reused for weekday patterns)
-- 4. academic_year_holiday_settings: NEW table for global holiday subscription preferences
--
-- We do NOT reuse blackout_periods for year planning holidays because:
--   - blackout_periods is for scheduling availability (child-specific, date ranges)
--   - holidays table is the canonical store for academic year holidays (year-level, single dates)
-- ============================================================

-- 1. Create academic_years table if it doesn't exist
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    year_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER,
    total_hours INTEGER,
    hours_per_day NUMERIC(5,2),
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraint solver fields to academic_years
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('FIXED_END', 'TARGET_DAYS', 'TARGET_HOURS')),
  ADD COLUMN IF NOT EXISTS target_instructional_days INTEGER,
  ADD COLUMN IF NOT EXISTS target_instructional_hours INTEGER,
  ADD COLUMN IF NOT EXISTS allowed_weekdays INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Mon-Fri default
  ADD COLUMN IF NOT EXISTS state_code TEXT;

-- Add comment explaining the constraint solver modes
COMMENT ON COLUMN academic_years.mode IS 'FIXED_END: end_date is fixed, compute days/hours. TARGET_DAYS: target_instructional_days is fixed, compute end_date. TARGET_HOURS: target_instructional_hours is fixed, compute end_date.';
COMMENT ON COLUMN academic_years.allowed_weekdays IS 'Array of weekday numbers (0=Sunday, 6=Saturday). Default [1,2,3,4,5] = Mon-Fri.';

-- Create indexes for academic_years
CREATE INDEX IF NOT EXISTS idx_academic_years_family_id ON academic_years(family_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_is_current ON academic_years(is_current);

-- 2. Create holidays table if it doesn't exist
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    holiday_name TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    is_proposed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add type and source_id columns for global holiday support
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('GLOBAL_HOLIDAY', 'CUSTOM_HOLIDAY', 'BREAK', 'BLACKOUT')) DEFAULT 'CUSTOM_HOLIDAY',
  ADD COLUMN IF NOT EXISTS source_id TEXT; -- Stable identifier from global holiday provider

-- Add unique constraint to prevent duplicate global holidays on resync
-- Note: academic_year_id + holiday_date + type + source_id should be unique
-- But source_id is nullable for custom holidays, so we use a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique_global 
  ON holidays(academic_year_id, holiday_date, type, source_id) 
  WHERE source_id IS NOT NULL;

-- Create indexes for holidays
CREATE INDEX IF NOT EXISTS idx_holidays_academic_year_id ON holidays(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_year_date ON holidays(academic_year_id, holiday_date);

-- 3. Create class_days table if it doesn't exist (for weekday patterns)
CREATE TABLE IF NOT EXISTS class_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 (Sunday) to 6 (Saturday)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_class_days_academic_year_id ON class_days(academic_year_id);

-- 4. Create academic_year_holiday_settings table for global holiday subscription
CREATE TABLE IF NOT EXISTS academic_year_holiday_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  follow_global_holidays BOOLEAN NOT NULL DEFAULT false,
  holiday_country_code TEXT, -- e.g., 'US', 'AU'
  holiday_region TEXT, -- Optional state/province subdivision
  provider TEXT CHECK (provider IN ('NAGER_DATE', 'GOOGLE_ICS', 'CALENDARIFIC')) DEFAULT 'NAGER_DATE',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_holiday_settings_year ON academic_year_holiday_settings(academic_year_id);

-- 5. Enable RLS and create policies for academic_years
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their family's academic years" ON academic_years;
DROP POLICY IF EXISTS "Users can insert their family's academic years" ON academic_years;
DROP POLICY IF EXISTS "Users can update their family's academic years" ON academic_years;
DROP POLICY IF EXISTS "Users can delete their family's academic years" ON academic_years;

CREATE POLICY "Users can view their family's academic years" ON academic_years
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their family's academic years" ON academic_years
    FOR INSERT WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their family's academic years" ON academic_years
    FOR UPDATE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their family's academic years" ON academic_years
    FOR DELETE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- 6. Enable RLS and create policies for holidays
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can insert their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can update their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can delete their family's holidays" ON holidays;

CREATE POLICY "Users can view their family's holidays" ON holidays
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's holidays" ON holidays
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's holidays" ON holidays
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's holidays" ON holidays
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- 7. Enable RLS and create policies for class_days
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can insert their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can update their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can delete their family's class days" ON class_days;

CREATE POLICY "Users can view their family's class days" ON class_days
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's class days" ON class_days
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's class days" ON class_days
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's class days" ON class_days
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- 8. RLS Policies for academic_year_holiday_settings
ALTER TABLE academic_year_holiday_settings ENABLE ROW LEVEL SECURITY;

-- Reuse the same pattern as academic_years policies
CREATE POLICY "Users can view their family's holiday settings" ON academic_year_holiday_settings
  FOR SELECT USING (
    academic_year_id IN (
      SELECT id FROM academic_years WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert their family's holiday settings" ON academic_year_holiday_settings
  FOR INSERT WITH CHECK (
    academic_year_id IN (
      SELECT id FROM academic_years WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their family's holiday settings" ON academic_year_holiday_settings
  FOR UPDATE USING (
    academic_year_id IN (
      SELECT id FROM academic_years WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete their family's holiday settings" ON academic_year_holiday_settings
  FOR DELETE USING (
    academic_year_id IN (
      SELECT id FROM academic_years WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- 9. Create trigger function for updated_at on academic_years
CREATE OR REPLACE FUNCTION update_academic_years_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_academic_years_updated_at ON academic_years;
CREATE TRIGGER update_academic_years_updated_at 
    BEFORE UPDATE ON academic_years
    FOR EACH ROW 
    EXECUTE FUNCTION update_academic_years_updated_at();

-- 10. Update trigger for updated_at on academic_year_holiday_settings
CREATE OR REPLACE FUNCTION update_academic_year_holiday_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_academic_year_holiday_settings_updated_at
  BEFORE UPDATE ON academic_year_holiday_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_academic_year_holiday_settings_updated_at();

-- 11. Helper function to check if a date is an instructional day
-- This considers allowed_weekdays and holidays
CREATE OR REPLACE FUNCTION is_instructional_day(
  p_date DATE,
  p_allowed_weekdays INTEGER[],
  p_holiday_dates DATE[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_day_of_week INTEGER;
BEGIN
  -- Get day of week (0=Sunday, 6=Saturday)
  v_day_of_week := EXTRACT(DOW FROM p_date)::INTEGER;
  
  -- Check if day is in allowed weekdays
  IF NOT (v_day_of_week = ANY(p_allowed_weekdays)) THEN
    RETURN false;
  END IF;
  
  -- Check if date is a holiday
  IF p_date = ANY(p_holiday_dates) THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 12. Function to count instructional days in a range
CREATE OR REPLACE FUNCTION count_instructional_days(
  p_start_date DATE,
  p_end_date DATE,
  p_allowed_weekdays INTEGER[],
  p_holiday_dates DATE[]
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_count INTEGER := 0;
  v_current_date DATE;
BEGIN
  v_current_date := p_start_date;
  
  WHILE v_current_date <= p_end_date LOOP
    IF is_instructional_day(v_current_date, p_allowed_weekdays, p_holiday_dates) THEN
      v_count := v_count + 1;
    END IF;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- 13. Function to compute end date given start date and target instructional days
CREATE OR REPLACE FUNCTION compute_end_date(
  p_start_date DATE,
  p_target_days INTEGER,
  p_allowed_weekdays INTEGER[],
  p_holiday_dates DATE[]
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_current_date DATE;
  v_count INTEGER := 0;
  v_max_iterations INTEGER := 1000; -- Safety limit
  v_iterations INTEGER := 0;
BEGIN
  v_current_date := p_start_date;
  
  WHILE v_count < p_target_days AND v_iterations < v_max_iterations LOOP
    IF is_instructional_day(v_current_date, p_allowed_weekdays, p_holiday_dates) THEN
      v_count := v_count + 1;
    END IF;
    
    -- If we've reached target, this is the last instructional day
    IF v_count = p_target_days THEN
      RETURN v_current_date;
    END IF;
    
    v_current_date := v_current_date + INTERVAL '1 day';
    v_iterations := v_iterations + 1;
  END LOOP;
  
  -- If we hit max iterations, return the current date anyway
  RETURN v_current_date;
END;
$$;

-- Success message
SELECT 'Plan Year feature migration completed successfully!' as status;
