-- Compliance: DB as source of truth — ensure state_requirements exists and add seed columns
-- (Table may be missing if only supabase/migrations run, not the root 2025-01-21 file.)

CREATE TABLE IF NOT EXISTS state_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  state_name text NOT NULL,
  requirement_type text NOT NULL CHECK (requirement_type IN ('attendance', 'portfolio', 'testing', 'notification', 'record_keeping', 'other')),
  requirement_title text NOT NULL,
  requirement_description text,
  is_common boolean DEFAULT true,
  grade_levels text[],
  source_url text,
  last_verified_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  requirement_key text,
  obligation_type text DEFAULT 'required'
);

-- Add columns if table already existed (e.g. from 2025-01-21 script)
ALTER TABLE state_requirements
  ADD COLUMN IF NOT EXISTS requirement_key text,
  ADD COLUMN IF NOT EXISTS obligation_type text DEFAULT 'required';

ALTER TABLE state_requirements
  DROP CONSTRAINT IF EXISTS state_requirements_obligation_type_check;
ALTER TABLE state_requirements
  ADD CONSTRAINT state_requirements_obligation_type_check
  CHECK (obligation_type IN ('required', 'optional', 'info'));

CREATE INDEX IF NOT EXISTS state_requirements_state_code_idx ON state_requirements(state_code);
CREATE INDEX IF NOT EXISTS state_requirements_type_idx ON state_requirements(requirement_type);
CREATE INDEX IF NOT EXISTS state_requirements_common_idx ON state_requirements(is_common);

-- Stable unique key for upsert: one row per (state_code, requirement_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_requirements_state_key
  ON state_requirements (state_code, requirement_key)
  WHERE requirement_key IS NOT NULL;

COMMENT ON TABLE state_requirements IS 'Reference data for state-specific homeschooling requirements (not legal advice). DB is source of truth; JSON is seed.';
COMMENT ON COLUMN state_requirements.requirement_key IS 'Stable key from seed (e.g. attendance, notice); used for upsert. Unique with state_code.';
COMMENT ON COLUMN state_requirements.obligation_type IS 'required | optional | info; maps to API type for UI.';

GRANT SELECT ON state_requirements TO authenticated;
GRANT SELECT ON state_requirements TO anon;
