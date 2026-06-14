-- Summer term date range on family planner settings (School Year Settings).

ALTER TABLE family_planner_settings
  ADD COLUMN IF NOT EXISTS default_summer_term_start_date DATE,
  ADD COLUMN IF NOT EXISTS default_summer_term_end_date DATE;

UPDATE family_planner_settings
SET
  default_summer_term_start_date = COALESCE(
    default_summer_term_start_date,
    make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 6, 1)
  ),
  default_summer_term_end_date = COALESCE(
    default_summer_term_end_date,
    make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 8, 31)
  )
WHERE school_year_label ~ '^\d{4}/\d{2}$';

ALTER TABLE family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_default_summer_range_chk;
ALTER TABLE family_planner_settings
  ADD CONSTRAINT family_planner_settings_default_summer_range_chk
  CHECK (
    default_summer_term_start_date IS NULL
    OR default_summer_term_end_date IS NULL
    OR default_summer_term_start_date <= default_summer_term_end_date
  );
