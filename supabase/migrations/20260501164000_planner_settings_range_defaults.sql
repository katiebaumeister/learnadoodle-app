BEGIN;

ALTER TABLE family_planner_settings
  ADD COLUMN IF NOT EXISTS default_year_start_date DATE,
  ADD COLUMN IF NOT EXISTS default_year_end_date DATE,
  ADD COLUMN IF NOT EXISTS default_fall_term_start_date DATE,
  ADD COLUMN IF NOT EXISTS default_fall_term_end_date DATE,
  ADD COLUMN IF NOT EXISTS default_spring_term_start_date DATE,
  ADD COLUMN IF NOT EXISTS default_spring_term_end_date DATE;

UPDATE family_planner_settings
SET
  default_year_start_date = COALESCE(default_year_start_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT), 8, 1)),
  default_year_end_date = COALESCE(default_year_end_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 5, 31)),
  default_fall_term_start_date = COALESCE(default_fall_term_start_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT), 8, 1)),
  default_fall_term_end_date = COALESCE(default_fall_term_end_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT), 12, 31)),
  default_spring_term_start_date = COALESCE(default_spring_term_start_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 1, 1)),
  default_spring_term_end_date = COALESCE(default_spring_term_end_date, make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 5, 1))
WHERE school_year_label ~ '^[0-9]{4}/[0-9]{2}$';

ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_default_year_range_chk;
ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_default_year_range_chk
  CHECK (
    default_year_start_date IS NULL
    OR default_year_end_date IS NULL
    OR default_year_start_date <= default_year_end_date
  );

ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_default_fall_range_chk;
ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_default_fall_range_chk
  CHECK (
    default_fall_term_start_date IS NULL
    OR default_fall_term_end_date IS NULL
    OR default_fall_term_start_date <= default_fall_term_end_date
  );

ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_default_spring_range_chk;
ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_default_spring_range_chk
  CHECK (
    default_spring_term_start_date IS NULL
    OR default_spring_term_end_date IS NULL
    OR default_spring_term_start_date <= default_spring_term_end_date
  );

COMMIT;
