-- ============================================================
-- Planner settings & exclusions consolidation
-- Replaces family.planner_defaults with normalized tables.
-- ============================================================

-- 1. Create family_planner_settings first (one row per family)
CREATE TABLE IF NOT EXISTS family_planner_settings (
  family_id UUID PRIMARY KEY REFERENCES family(id) ON DELETE CASCADE,
  default_school_year TEXT,
  default_constraint_mode TEXT CHECK (default_constraint_mode IN ('none', 'days', 'hours')) NOT NULL DEFAULT 'none',
  default_target_days INTEGER,
  default_target_hours NUMERIC(10,2),
  default_planned_hours_per_day NUMERIC(5,2),
  follow_public_holidays BOOLEAN NOT NULL DEFAULT true,
  holiday_country TEXT DEFAULT 'US',
  holiday_region TEXT,
  allowed_weekdays INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  default_day_start_time TIME,
  default_day_end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE family_planner_settings IS 'Family-wide planning defaults. Powers Planning Preferences page. Plan My Year uses these as starting values.';

-- 2. Create planner_exclusions (reusable, queryable exclusions)
CREATE TABLE IF NOT EXISTS planner_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('family_default', 'academic_year', 'subject', 'plan')),
  exclusion_type TEXT NOT NULL CHECK (exclusion_type IN ('holiday', 'break', 'excluded_date')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label TEXT,
  source TEXT CHECK (source IN ('settings', 'public_holiday_sync', 'plan_year', 'manual')) DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_from_plan_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_exclusions_family ON planner_exclusions(family_id);
CREATE INDEX IF NOT EXISTS idx_planner_exclusions_academic_year ON planner_exclusions(academic_year_id) WHERE academic_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_planner_exclusions_scope ON planner_exclusions(family_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_planner_exclusions_dates ON planner_exclusions(family_id, start_date, end_date);

COMMENT ON TABLE planner_exclusions IS 'Unified exclusions (holidays, breaks). Queryable, reusable. scope_type: family_default | academic_year | subject | plan.';

-- 3. Migrate data from family.planner_defaults if it exists, then drop column
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family' AND column_name = 'planner_defaults'
  ) THEN
    FOR r IN
      SELECT id, planner_defaults FROM family
      WHERE planner_defaults IS NOT NULL AND planner_defaults != '{}'::jsonb
    LOOP
      INSERT INTO family_planner_settings (family_id, default_constraint_mode, default_target_days, default_target_hours, default_planned_hours_per_day, follow_public_holidays, updated_at)
      VALUES (
        r.id,
        COALESCE(r.planner_defaults->>'goal_mode', 'none'),
        (r.planner_defaults->>'target_instructional_days')::int,
        (r.planner_defaults->>'target_instructional_hours')::numeric,
        (r.planner_defaults->>'planned_hours_per_day')::numeric,
        COALESCE((r.planner_defaults->>'follow_global_holidays')::boolean, true),
        NOW()
      )
      ON CONFLICT (family_id) DO UPDATE SET
        default_constraint_mode = EXCLUDED.default_constraint_mode,
        default_target_days = EXCLUDED.default_target_days,
        default_target_hours = EXCLUDED.default_target_hours,
        default_planned_hours_per_day = EXCLUDED.default_planned_hours_per_day,
        follow_public_holidays = EXCLUDED.follow_public_holidays,
        updated_at = NOW();
      INSERT INTO planner_exclusions (family_id, scope_type, exclusion_type, start_date, end_date, label, source)
      SELECT r.id, 'family_default', 'holiday', (h->>'date')::date, (h->>'date')::date, COALESCE(h->>'name', 'Holiday'), 'settings'
      FROM jsonb_array_elements(COALESCE(r.planner_defaults->'custom_holidays', '[]'::jsonb)) AS h
      WHERE h->>'date' IS NOT NULL;
      INSERT INTO planner_exclusions (family_id, scope_type, exclusion_type, start_date, end_date, label, source)
      SELECT r.id, 'family_default', 'break', (b->>'start')::date, (b->>'end')::date, COALESCE(b->>'name', 'Break'), 'settings'
      FROM jsonb_array_elements(COALESCE(r.planner_defaults->'custom_breaks', '[]'::jsonb)) AS b
      WHERE b->>'start' IS NOT NULL AND b->>'end' IS NOT NULL;
    END LOOP;
    ALTER TABLE family DROP COLUMN IF EXISTS planner_defaults;
  END IF;
END $$;

-- 4. Add subject.default_constraint_mode
ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS default_constraint_mode TEXT CHECK (default_constraint_mode IN ('none', 'days', 'hours'));

COMMENT ON COLUMN subject.default_constraint_mode IS 'Subject-specific default: none | days | hours. Used to pre-fill Plan My Year.';

-- 5. RLS for family_planner_settings
ALTER TABLE family_planner_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_planner_settings_select ON family_planner_settings;
DROP POLICY IF EXISTS family_planner_settings_insert ON family_planner_settings;
DROP POLICY IF EXISTS family_planner_settings_update ON family_planner_settings;

CREATE POLICY family_planner_settings_select ON family_planner_settings
  FOR SELECT USING (is_family_member(family_id));
CREATE POLICY family_planner_settings_insert ON family_planner_settings
  FOR INSERT WITH CHECK (is_family_member(family_id));
CREATE POLICY family_planner_settings_update ON family_planner_settings
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE ON family_planner_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON family_planner_settings TO service_role;

-- 6. RLS for planner_exclusions
ALTER TABLE planner_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_exclusions_select ON planner_exclusions;
DROP POLICY IF EXISTS planner_exclusions_insert ON planner_exclusions;
DROP POLICY IF EXISTS planner_exclusions_update ON planner_exclusions;
DROP POLICY IF EXISTS planner_exclusions_delete ON planner_exclusions;

CREATE POLICY planner_exclusions_select ON planner_exclusions
  FOR SELECT USING (is_family_member(family_id));
CREATE POLICY planner_exclusions_insert ON planner_exclusions
  FOR INSERT WITH CHECK (is_family_member(family_id));
CREATE POLICY planner_exclusions_update ON planner_exclusions
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));
CREATE POLICY planner_exclusions_delete ON planner_exclusions
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_exclusions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_exclusions TO service_role;

-- 7. Trigger for family_planner_settings updated_at
CREATE OR REPLACE FUNCTION update_family_planner_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_family_planner_settings_updated_at ON family_planner_settings;
CREATE TRIGGER update_family_planner_settings_updated_at
  BEFORE UPDATE ON family_planner_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_family_planner_settings_updated_at();

-- 8. Trigger for planner_exclusions updated_at
CREATE OR REPLACE FUNCTION update_planner_exclusions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_planner_exclusions_updated_at ON planner_exclusions;
CREATE TRIGGER update_planner_exclusions_updated_at
  BEFORE UPDATE ON planner_exclusions
  FOR EACH ROW
  EXECUTE FUNCTION update_planner_exclusions_updated_at();
