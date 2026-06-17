-- Align spring/summer term end defaults with product defaults (May 31 / July 31).

UPDATE family_planner_settings
SET default_spring_term_end_date = make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 5, 31)
WHERE school_year_label ~ '^\d{4}/\d{2}$'
  AND default_spring_term_end_date = make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 5, 1);

UPDATE family_planner_settings
SET default_summer_term_end_date = make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 7, 31)
WHERE school_year_label ~ '^\d{4}/\d{2}$'
  AND default_summer_term_end_date = make_date(CAST(split_part(school_year_label, '/', 1) AS INT) + 1, 8, 31);
