-- Migration: Add Term Builder Support
-- Enables custom term cycles (semesters, quarters, trimesters) for year plans

-- ============================================================================
-- 1. Create terms table
-- ============================================================================
CREATE TABLE IF NOT EXISTS year_plan_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_plan_id uuid NOT NULL REFERENCES year_plans(id) ON DELETE CASCADE,
  term_name text NOT NULL,
  term_type text NOT NULL CHECK (term_type IN ('semester', 'quarter', 'trimester', 'custom')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  term_number int, -- 1, 2, 3, etc. for ordering
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_terms_year_plan ON year_plan_terms(year_plan_id);
CREATE INDEX IF NOT EXISTS idx_terms_dates ON year_plan_terms(start_date, end_date);

-- Enable RLS
ALTER TABLE year_plan_terms ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access terms for their family's year plans
CREATE POLICY terms_rw ON year_plan_terms
FOR ALL 
USING (
  year_plan_id IN (
    SELECT id FROM year_plans 
    WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  )
)
WITH CHECK (
  year_plan_id IN (
    SELECT id FROM year_plans 
    WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  )
);

-- ============================================================================
-- 2. Add term_id to term_milestones for linking
-- ============================================================================
ALTER TABLE term_milestones ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES year_plan_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_term ON term_milestones(term_id);

-- ============================================================================
-- 3. Function to auto-generate terms based on term_type
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_terms_for_year_plan(
  p_year_plan_id uuid,
  p_term_type text,
  p_start_date date,
  p_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _term_count int;
  _days_per_term int;
  _current_start date;
  _current_end date;
  _term_num int := 1;
  _term_name text;
BEGIN
  -- Delete existing terms for this year plan
  DELETE FROM year_plan_terms WHERE year_plan_id = p_year_plan_id;
  
  -- Calculate number of terms and days per term
  CASE p_term_type
    WHEN 'semester' THEN
      _term_count := 2;
    WHEN 'quarter' THEN
      _term_count := 4;
    WHEN 'trimester' THEN
      _term_count := 3;
    ELSE
      -- Custom - don't auto-generate
      RETURN;
  END CASE;
  
  _days_per_term := (p_end_date - p_start_date) / _term_count;
  _current_start := p_start_date;
  
  -- Generate terms
  WHILE _term_num <= _term_count AND _current_start <= p_end_date
  LOOP
    IF _term_num = _term_count THEN
      -- Last term goes to end date
      _current_end := p_end_date;
    ELSE
      _current_end := _current_start + (_days_per_term - 1);
    END IF;
    
    _term_name := CASE p_term_type
      WHEN 'semester' THEN 'Semester ' || _term_num
      WHEN 'quarter' THEN 'Quarter ' || _term_num
      WHEN 'trimester' THEN 'Trimester ' || _term_num
      ELSE 'Term ' || _term_num
    END;
    
    INSERT INTO year_plan_terms (
      year_plan_id,
      term_name,
      term_type,
      start_date,
      end_date,
      term_number
    )
    VALUES (
      p_year_plan_id,
      _term_name,
      p_term_type,
      _current_start,
      _current_end,
      _term_num
    );
    
    _current_start := _current_end + 1;
    _term_num := _term_num + 1;
  END LOOP;
  
  -- Link existing milestones to terms
  UPDATE term_milestones tm
  SET term_id = t.id
  FROM year_plan_terms t
  WHERE tm.year_plan_id = t.year_plan_id
    AND tm.week_start >= t.start_date
    AND tm.week_start <= t.end_date
    AND tm.year_plan_id = p_year_plan_id;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON year_plan_terms TO authenticated;
GRANT ALL ON year_plan_terms TO service_role;

