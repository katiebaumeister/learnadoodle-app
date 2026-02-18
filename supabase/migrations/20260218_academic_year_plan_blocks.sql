-- ============================================================
-- Plan My Year: Blocks model, exclusions, source_block_id
-- Per DESIGN_PLAN_YEAR.md
-- ============================================================

-- 1. events.source_block_id — first-class column, core relational link
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'source_block_id') THEN
    ALTER TABLE events ADD COLUMN source_block_id uuid NULL;
    COMMENT ON COLUMN events.source_block_id IS 'Block that produced this event; enables update-on-block-change, drift analysis, debugging';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_source_block_id
  ON events(source_block_id)
  WHERE source_block_id IS NOT NULL;


-- 2. academic_year_exclusions — unified range-based exclusion model
-- is_excluded(date) = any(exclusion.start_date <= date <= exclusion.end_date)
CREATE TABLE IF NOT EXISTS academic_year_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('holiday', 'break', 'blackout')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_year_exclusions_academic_year_id
  ON academic_year_exclusions(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_academic_year_exclusions_range
  ON academic_year_exclusions(academic_year_id, start_date, end_date);


-- 3. academic_year_plan — 1-to-1 with academic year, blocks + constraints
CREATE TABLE IF NOT EXISTS academic_year_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  constraint_mode text NOT NULL CHECK (constraint_mode IN ('days', 'hours')),
  target_days int,
  target_hours numeric(10,2),
  blocks jsonb NOT NULL DEFAULT '[]',
  qualifying_event_types text[] DEFAULT ARRAY['lesson'],
  current_generation_id uuid,
  health_cache jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(academic_year_id)
);

COMMENT ON COLUMN academic_year_plan.blocks IS 'Array of block defs: { block_id, subject_id, child_ids, weekdays, start_time, end_time, all_day }';
COMMENT ON COLUMN academic_year_plan.health_cache IS '{ planned_days, planned_hours, delta_days, delta_hours, percent_complete, computed_at }';
COMMENT ON COLUMN academic_year_plan.current_generation_id IS 'UUID for each Apply run; events use generation_batch_id linked to this';

CREATE INDEX IF NOT EXISTS idx_academic_year_plan_academic_year_id
  ON academic_year_plan(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_academic_year_plan_family_id
  ON academic_year_plan(family_id);
