-- Allow clients to read predefined school year templates.

DO $$
BEGIN
  IF to_regclass('public.school_year_templates') IS NULL THEN
    RAISE NOTICE 'Skipping: public.school_year_templates does not exist';
    RETURN;
  END IF;

  EXECUTE 'GRANT SELECT ON TABLE public.school_year_templates TO authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.school_year_templates TO service_role';
END
$$;

DO $$
BEGIN
  IF to_regclass('public.school_year_templates') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.school_year_templates ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS school_year_templates_select_authenticated ON public.school_year_templates;
  CREATE POLICY school_year_templates_select_authenticated
    ON public.school_year_templates
    FOR SELECT
    TO authenticated
    USING (true);
END
$$;
