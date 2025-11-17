-- Migration: Create year_plans table
-- Part of Phase 1 - Year-Round Intelligence Core

CREATE TABLE IF NOT EXISTS year_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  plan_scope text DEFAULT 'current',                 -- current | next | custom
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_weeks int GENERATED ALWAYS AS (((end_date - start_date) / 7) + 1) STORED,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_year_plans_family ON year_plans(family_id);
CREATE INDEX IF NOT EXISTS idx_year_plans_dates ON year_plans(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_year_plans_scope ON year_plans(plan_scope);

-- Enable RLS
ALTER TABLE year_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access year_plans for their family
CREATE POLICY year_plans_rw ON year_plans
FOR ALL 
USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
)
WITH CHECK (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

