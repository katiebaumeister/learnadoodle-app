-- Migration: Create year_plan_children table
-- Part of Phase 1 - Year-Round Intelligence Core

CREATE TABLE IF NOT EXISTS year_plan_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_plan_id uuid NOT NULL REFERENCES year_plans(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subjects jsonb DEFAULT '[]'::jsonb,                -- [{key:'math', target_min_per_week:180}]
  hours_per_week jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(year_plan_id, child_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ypc_plan ON year_plan_children(year_plan_id);
CREATE INDEX IF NOT EXISTS idx_ypc_child ON year_plan_children(child_id);

-- Enable RLS
ALTER TABLE year_plan_children ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access year_plan_children for their family's year plans
CREATE POLICY ypc_rw ON year_plan_children
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

