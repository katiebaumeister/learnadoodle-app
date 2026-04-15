-- Backfill/link legacy academic_years into family_school_years where possible.
-- Goal: existing plans can participate in school-year/term defaults features.

-- 1) Create missing family_school_year rows from existing academic_years.
WITH candidate_years AS (
  SELECT
    ay.id AS academic_year_id,
    ay.family_id,
    COALESCE(NULLIF(trim(ay.year_name), ''), to_char(ay.start_date, 'YYYY') || '/' || right(to_char(ay.end_date, 'YYYY'), 2)) AS label,
    ay.start_date,
    ay.end_date,
    hs.follow_global_holidays,
    hs.holiday_country_code,
    hs.holiday_region,
    hs.provider,
    hs.excluded_holiday_dates,
    ap.constraint_mode,
    ap.target_days,
    ap.target_hours,
    ap.subject_targets,
    NULL::text AS timezone
  FROM public.academic_years ay
  LEFT JOIN public.academic_year_holiday_settings hs
    ON hs.academic_year_id = ay.id
  LEFT JOIN public.academic_year_plan ap
    ON ap.academic_year_id = ay.id
  WHERE ay.family_school_year_id IS NULL
),
missing_rows AS (
  SELECT cy.*
  FROM candidate_years cy
  LEFT JOIN public.family_school_years fsy
    ON fsy.family_id = cy.family_id
   AND fsy.start_date = cy.start_date
   AND fsy.end_date = cy.end_date
  WHERE fsy.id IS NULL
),
deduped_missing_rows AS (
  SELECT DISTINCT ON (mr.family_id, mr.label)
    mr.*
  FROM missing_rows mr
  ORDER BY
    mr.family_id,
    mr.label,
    mr.end_date DESC,
    mr.start_date DESC,
    mr.academic_year_id DESC
)
INSERT INTO public.family_school_years (
  family_id,
  school_year_template_id,
  label,
  start_date,
  end_date,
  timezone,
  year_defaults_json
)
SELECT
  mr.family_id,
  NULL,
  mr.label,
  mr.start_date,
  mr.end_date,
  mr.timezone,
  jsonb_build_object(
    'holiday_settings', jsonb_build_object(
      'follow_global_holidays', COALESCE(mr.follow_global_holidays, false),
      'holiday_country_code', mr.holiday_country_code,
      'holiday_region', mr.holiday_region,
      'provider', COALESCE(mr.provider, 'NAGER_DATE'),
      'excluded_holiday_dates', COALESCE(to_jsonb(mr.excluded_holiday_dates), '[]'::jsonb)
    ),
    'planning', jsonb_build_object(
      'constraint_mode', COALESCE(mr.constraint_mode, 'days'),
      'target_days', mr.target_days,
      'target_hours', mr.target_hours,
      'subject_targets', COALESCE(to_jsonb(mr.subject_targets), '{}'::jsonb)
    )
  )
FROM deduped_missing_rows mr
ON CONFLICT (family_id, label) DO UPDATE
SET
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  year_defaults_json = COALESCE(public.family_school_years.year_defaults_json, '{}'::jsonb) || COALESCE(EXCLUDED.year_defaults_json, '{}'::jsonb);

-- 2) Link academic_years to family_school_years by family + date bounds.
UPDATE public.academic_years ay
SET family_school_year_id = fsy.id
FROM public.family_school_years fsy
WHERE ay.family_school_year_id IS NULL
  AND fsy.family_id = ay.family_id
  AND fsy.start_date = ay.start_date
  AND fsy.end_date = ay.end_date;

-- 3) Fallback link by family + label when date bounds differ but label already existed.
UPDATE public.academic_years ay
SET family_school_year_id = fsy.id
FROM public.family_school_years fsy
WHERE ay.family_school_year_id IS NULL
  AND fsy.family_id = ay.family_id
  AND fsy.label = COALESCE(
    NULLIF(trim(ay.year_name), ''),
    to_char(ay.start_date, 'YYYY') || '/' || right(to_char(ay.end_date, 'YYYY'), 2)
  );
