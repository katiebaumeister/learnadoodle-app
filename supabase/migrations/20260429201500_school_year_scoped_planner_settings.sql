-- ============================================================
-- School-year scoped planning preferences
-- - family_planner_settings keyed by (family_id, school_year_label)
-- - planner_exclusions family_default rows scoped by school_year_label
-- ============================================================

BEGIN;

-- 1) family_planner_settings: add school_year_label
ALTER TABLE family_planner_settings
  ADD COLUMN IF NOT EXISTS school_year_label TEXT;

-- Backfill from default_school_year when available; otherwise derive current school year.
UPDATE family_planner_settings
SET school_year_label = COALESCE(
  NULLIF(default_school_year, ''),
  CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 8
      THEN CONCAT(EXTRACT(YEAR FROM NOW())::INT, '/', RIGHT((EXTRACT(YEAR FROM NOW())::INT + 1)::TEXT, 2))
    ELSE CONCAT((EXTRACT(YEAR FROM NOW())::INT - 1), '/', RIGHT((EXTRACT(YEAR FROM NOW())::INT)::TEXT, 2))
  END
)
WHERE school_year_label IS NULL OR school_year_label = '';

ALTER TABLE family_planner_settings
  ALTER COLUMN school_year_label SET NOT NULL;

ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_school_year_label_format_chk;

ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_school_year_label_format_chk
  CHECK (school_year_label ~ '^[0-9]{4}/[0-9]{2}$');

-- Keep default_school_year aligned for callers that still read it.
UPDATE family_planner_settings
SET default_school_year = school_year_label
WHERE default_school_year IS NULL OR default_school_year = '';

-- Switch primary key to composite.
ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_pkey;

ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_pkey
  PRIMARY KEY (family_id, school_year_label);

CREATE INDEX IF NOT EXISTS idx_family_planner_settings_family_updated
  ON family_planner_settings (family_id, updated_at DESC);

-- 2) planner_exclusions: add school_year_label
ALTER TABLE planner_exclusions
  ADD COLUMN IF NOT EXISTS school_year_label TEXT;

-- Backfill family_default exclusions using family planner settings default_school_year,
-- then fallback to current school-year label.
WITH fallback AS (
  SELECT CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 8
      THEN CONCAT(EXTRACT(YEAR FROM NOW())::INT, '/', RIGHT((EXTRACT(YEAR FROM NOW())::INT + 1)::TEXT, 2))
    ELSE CONCAT((EXTRACT(YEAR FROM NOW())::INT - 1), '/', RIGHT((EXTRACT(YEAR FROM NOW())::INT)::TEXT, 2))
  END AS sy
)
UPDATE planner_exclusions pe
SET school_year_label = COALESCE(
  NULLIF((
    SELECT COALESCE(NULLIF(f.default_school_year, ''), NULLIF(f.school_year_label, ''))
    FROM family_planner_settings f
    WHERE f.family_id = pe.family_id
    ORDER BY f.updated_at DESC
    LIMIT 1
  ), ''),
  fallback.sy
)
FROM fallback
WHERE pe.scope_type = 'family_default'
  AND (pe.school_year_label IS NULL OR pe.school_year_label = '');

ALTER TABLE planner_exclusions
  DROP CONSTRAINT IF EXISTS planner_exclusions_school_year_label_format_chk;

ALTER TABLE planner_exclusions
  ADD CONSTRAINT planner_exclusions_school_year_label_format_chk
  CHECK (
    school_year_label IS NULL
    OR school_year_label ~ '^[0-9]{4}/[0-9]{2}$'
  );

ALTER TABLE planner_exclusions
  DROP CONSTRAINT IF EXISTS planner_exclusions_family_default_year_required_chk;

ALTER TABLE planner_exclusions
  ADD CONSTRAINT planner_exclusions_family_default_year_required_chk
  CHECK (
    scope_type <> 'family_default'
    OR school_year_label IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_planner_exclusions_family_scope_year
  ON planner_exclusions (family_id, scope_type, school_year_label);

CREATE INDEX IF NOT EXISTS idx_planner_exclusions_family_scope_year_dates
  ON planner_exclusions (family_id, scope_type, school_year_label, start_date, end_date);

COMMIT;

