-- Migration: Add A/B Day Scheduling Support
-- Enables rotating block schedules (A/B days, custom patterns) for year plans

-- ============================================================================
-- 1. Create schedule_patterns table for A/B day and custom patterns
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedule_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_plan_id uuid REFERENCES year_plans(id) ON DELETE CASCADE,
  family_id uuid NOT NULL, -- For family-level patterns
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL for family-wide, set for child-specific
  pattern_type text NOT NULL CHECK (pattern_type IN ('ab_day', 'rotating_blocks', 'custom')),
  pattern_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  
  -- A/B Day specific fields
  ab_day_cycle text CHECK (pattern_type = 'ab_day' AND ab_day_cycle IN ('2_day', '3_day', '4_day', 'custom')),
  ab_day_start text CHECK (pattern_type = 'ab_day' AND ab_day_start IN ('A', 'B', 'C', 'D')),
  
  -- Rotating blocks specific fields
  block_count int CHECK (pattern_type = 'rotating_blocks' AND block_count > 0),
  block_names text[] CHECK (pattern_type = 'rotating_blocks'),
  rotation_days int CHECK (pattern_type = 'rotating_blocks' AND rotation_days > 0),
  
  -- Custom pattern fields (stored as JSONB for flexibility)
  custom_pattern jsonb CHECK (pattern_type = 'custom'),
  
  -- Pattern definition (which days of week, which pattern days)
  pattern_days jsonb NOT NULL, -- e.g., {"Monday": "A", "Tuesday": "B", "Wednesday": "A", ...}
  
  -- Metadata
  is_active boolean DEFAULT true,
  priority int DEFAULT 100, -- Higher priority overrides lower priority
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT schedule_patterns_family_or_child CHECK (
    (family_id IS NOT NULL AND child_id IS NULL) OR
    (family_id IS NOT NULL AND child_id IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_patterns_year_plan ON schedule_patterns(year_plan_id);
CREATE INDEX IF NOT EXISTS idx_schedule_patterns_family ON schedule_patterns(family_id);
CREATE INDEX IF NOT EXISTS idx_schedule_patterns_child ON schedule_patterns(child_id);
CREATE INDEX IF NOT EXISTS idx_schedule_patterns_dates ON schedule_patterns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_patterns_active ON schedule_patterns(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE schedule_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access patterns for their family
CREATE POLICY schedule_patterns_rw ON schedule_patterns
FOR ALL 
USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
)
WITH CHECK (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 2. Function to determine pattern day for a given date
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pattern_day_for_date(
  p_family_id uuid,
  p_date date,
  p_child_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pattern record;
  v_day_name text;
  v_pattern_day text;
  v_days_elapsed int;
  v_cycle_position int;
BEGIN
  -- Get active pattern for this date
  SELECT * INTO v_pattern
  FROM schedule_patterns
  WHERE family_id = p_family_id
    AND (child_id = p_child_id OR (child_id IS NULL AND p_child_id IS NULL))
    AND pattern_type = 'ab_day'
    AND is_active = true
    AND p_date >= start_date
    AND p_date <= end_date
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;
  
  -- If no pattern found, return NULL
  IF v_pattern IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get day of week name
  v_day_name := TO_CHAR(p_date, 'Day'); -- Returns 'Monday   ', 'Tuesday  ', etc.
  v_day_name := TRIM(v_day_name);
  
  -- Check if pattern_days has this day
  IF v_pattern.pattern_days ? v_day_name THEN
    RETURN v_pattern.pattern_days->>v_day_name;
  END IF;
  
  -- If not in pattern_days, calculate based on cycle
  IF v_pattern.ab_day_cycle = '2_day' THEN
    -- Calculate days since start_date
    v_days_elapsed := p_date - v_pattern.start_date;
    
    -- Determine if A or B day
    IF v_pattern.ab_day_start = 'A' THEN
      RETURN CASE WHEN v_days_elapsed % 2 = 0 THEN 'A' ELSE 'B' END;
    ELSE
      RETURN CASE WHEN v_days_elapsed % 2 = 0 THEN 'B' ELSE 'A' END;
    END IF;
  END IF;
  
  -- For other cycles, use pattern_days or return NULL
  RETURN NULL;
END;
$$;

-- ============================================================================
-- 3. Function to get all pattern days for a date range
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pattern_days_for_range(
  p_family_id uuid,
  p_start_date date,
  p_end_date date,
  p_child_id uuid DEFAULT NULL
)
RETURNS TABLE (
  date date,
  pattern_day text,
  pattern_name text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current_date date;
  v_pattern_day text;
BEGIN
  v_current_date := p_start_date;
  
  WHILE v_current_date <= p_end_date LOOP
    v_pattern_day := get_pattern_day_for_date(p_family_id, v_current_date, p_child_id);
    
    IF v_pattern_day IS NOT NULL THEN
      RETURN QUERY
      SELECT 
        v_current_date,
        v_pattern_day,
        (SELECT pattern_name FROM schedule_patterns 
         WHERE family_id = p_family_id
           AND (child_id = p_child_id OR (child_id IS NULL AND p_child_id IS NULL))
           AND pattern_type = 'ab_day'
           AND is_active = true
           AND v_current_date >= start_date
           AND v_current_date <= end_date
         ORDER BY priority DESC, created_at DESC
         LIMIT 1);
    END IF;
    
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- ============================================================================
-- 4. Add pattern_day to events table (optional, for tracking)
-- ============================================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS pattern_day text;
CREATE INDEX IF NOT EXISTS idx_events_pattern_day ON events(pattern_day) WHERE pattern_day IS NOT NULL;

-- ============================================================================
-- 5. Add pattern_day to calendar_days_cache (for quick lookup)
-- ============================================================================
ALTER TABLE calendar_days_cache ADD COLUMN IF NOT EXISTS pattern_day text;
CREATE INDEX IF NOT EXISTS idx_calendar_days_cache_pattern_day ON calendar_days_cache(pattern_day) WHERE pattern_day IS NOT NULL;

COMMENT ON TABLE schedule_patterns IS 'Stores A/B day schedules, rotating blocks, and custom school patterns';
COMMENT ON FUNCTION get_pattern_day_for_date IS 'Returns the pattern day (A, B, etc.) for a given date based on active schedule patterns';
COMMENT ON FUNCTION get_pattern_days_for_range IS 'Returns all pattern days for a date range';

