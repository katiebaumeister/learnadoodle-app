-- Family onboarding: default_planning_mode and onboarding_completed
-- Used for 3-state gating: authenticated → onboarding incomplete → onboarding complete
-- Table name: "family" (singular). Consistent across migrations, RLS, and API (do not use "families").

-- Add default_planning_mode (nullable until set in onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family' AND column_name = 'default_planning_mode'
  ) THEN
    ALTER TABLE family
    ADD COLUMN default_planning_mode TEXT
    CHECK (default_planning_mode IN ('HOMESCHOOL_COMPLIANCE', 'AFTERSCHOOL_GOALS', 'NONE'));
  END IF;
END $$;

-- Add onboarding_completed (single source of truth for "setup complete")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE family
    ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN family.onboarding_completed IS 'True when planning mode set, at least one child, and at least one subject exist.';
  END IF;
END $$;

-- Backfill from legacy has_completed_onboarding if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family' AND column_name = 'has_completed_onboarding'
  ) THEN
    UPDATE family
    SET onboarding_completed = COALESCE(has_completed_onboarding, FALSE)
    WHERE onboarding_completed IS NOT TRUE AND (has_completed_onboarding IS TRUE OR has_completed_onboarding = true);
  END IF;
END $$;

-- Mark existing families that already have children and subjects as completed (so they are not blocked)
UPDATE family f
SET onboarding_completed = TRUE
WHERE (f.onboarding_completed IS NOT TRUE OR f.onboarding_completed = FALSE)
AND EXISTS (SELECT 1 FROM children c WHERE c.family_id = f.id)
AND EXISTS (SELECT 1 FROM subject s WHERE s.family_id = f.id);

-- Optional: add color to subject for onboarding-created subjects (if column missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subject' AND column_name = 'color'
  ) THEN
    ALTER TABLE subject ADD COLUMN color TEXT;
  END IF;
END $$;
