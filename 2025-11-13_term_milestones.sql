-- Migration: Create term_milestones table
-- Part of Phase 1 - Year-Round Intelligence Core

CREATE TABLE IF NOT EXISTS term_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_plan_id uuid NOT NULL REFERENCES year_plans(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  summary text,
  progress_target jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_term_milestones_plan ON term_milestones(year_plan_id);
CREATE INDEX IF NOT EXISTS idx_term_milestones_weeks ON term_milestones(week_start, week_end);

-- Enable RLS
ALTER TABLE term_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access milestones for their family's year plans
CREATE POLICY tm_rw ON term_milestones
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

