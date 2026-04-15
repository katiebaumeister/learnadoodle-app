-- Normalize school-year templates to fixed Aug 1 -> May 31 ranges.
-- Required UX:
--   2025/26 => 2025-08-01 .. 2026-05-31
--   2026/27 => 2026-08-01 .. 2027-05-31
--   ... rolling forward

-- Keep canonical nominal boundaries for all templates.
UPDATE public.school_year_templates
SET
  nominal_start_month_day = '08-01',
  nominal_end_month_day = '05-31',
  updated_at = now()
WHERE nominal_start_month_day IS DISTINCT FROM '08-01'
   OR nominal_end_month_day IS DISTINCT FROM '05-31';

-- Ensure we have a predictable 12-year horizon starting at 2025.
DO $$
DECLARE
  _start_year integer := 2025;
  _years integer := 12;
  _y integer;
BEGIN
  FOR _y IN _start_year .. (_start_year + _years - 1) LOOP
    INSERT INTO public.school_year_templates (
      start_year,
      end_year,
      label,
      nominal_start_month_day,
      nominal_end_month_day
    )
    VALUES (
      _y,
      _y + 1,
      format('%s/%s', _y, right((_y + 1)::text, 2)),
      '08-01',
      '05-31'
    )
    ON CONFLICT (start_year) DO UPDATE
    SET
      end_year = EXCLUDED.end_year,
      label = EXCLUDED.label,
      nominal_start_month_day = EXCLUDED.nominal_start_month_day,
      nominal_end_month_day = EXCLUDED.nominal_end_month_day,
      updated_at = now();
  END LOOP;
END
$$;
