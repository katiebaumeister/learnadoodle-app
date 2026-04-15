-- RLS + grants for year/term defaults tables.
-- Access rule: authenticated users can operate on rows tied to a family they belong to
-- via profiles.family_id or family_members.family_id.

DO $$
BEGIN
  IF to_regclass('public.family_school_years') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_school_years TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_school_years TO service_role';
  END IF;
  IF to_regclass('public.family_school_terms') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_school_terms TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_school_terms TO service_role';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.family_school_years') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.family_school_years ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS family_school_years_select ON public.family_school_years;
  DROP POLICY IF EXISTS family_school_years_insert ON public.family_school_years;
  DROP POLICY IF EXISTS family_school_years_update ON public.family_school_years;
  DROP POLICY IF EXISTS family_school_years_delete ON public.family_school_years;

  CREATE POLICY family_school_years_select
    ON public.family_school_years
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.family_id = family_school_years.family_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.user_id = auth.uid()
          AND fm.family_id = family_school_years.family_id
      )
    );

  CREATE POLICY family_school_years_insert
    ON public.family_school_years
    FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.family_id = family_school_years.family_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.user_id = auth.uid()
          AND fm.family_id = family_school_years.family_id
      )
    );

  CREATE POLICY family_school_years_update
    ON public.family_school_years
    FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.family_id = family_school_years.family_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.user_id = auth.uid()
          AND fm.family_id = family_school_years.family_id
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.family_id = family_school_years.family_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.user_id = auth.uid()
          AND fm.family_id = family_school_years.family_id
      )
    );

  CREATE POLICY family_school_years_delete
    ON public.family_school_years
    FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.family_id = family_school_years.family_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.user_id = auth.uid()
          AND fm.family_id = family_school_years.family_id
      )
    );
END
$$;

DO $$
BEGIN
  IF to_regclass('public.family_school_terms') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.family_school_terms ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS family_school_terms_select ON public.family_school_terms;
  DROP POLICY IF EXISTS family_school_terms_insert ON public.family_school_terms;
  DROP POLICY IF EXISTS family_school_terms_update ON public.family_school_terms;
  DROP POLICY IF EXISTS family_school_terms_delete ON public.family_school_terms;

  CREATE POLICY family_school_terms_select
    ON public.family_school_terms
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.family_school_years fsy
        LEFT JOIN public.profiles p
          ON p.id = auth.uid()
         AND p.family_id = fsy.family_id
        LEFT JOIN public.family_members fm
          ON fm.user_id = auth.uid()
         AND fm.family_id = fsy.family_id
        WHERE fsy.id = family_school_terms.family_school_year_id
          AND (p.id IS NOT NULL OR fm.user_id IS NOT NULL)
      )
    );

  CREATE POLICY family_school_terms_insert
    ON public.family_school_terms
    FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.family_school_years fsy
        LEFT JOIN public.profiles p
          ON p.id = auth.uid()
         AND p.family_id = fsy.family_id
        LEFT JOIN public.family_members fm
          ON fm.user_id = auth.uid()
         AND fm.family_id = fsy.family_id
        WHERE fsy.id = family_school_terms.family_school_year_id
          AND (p.id IS NOT NULL OR fm.user_id IS NOT NULL)
      )
    );

  CREATE POLICY family_school_terms_update
    ON public.family_school_terms
    FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.family_school_years fsy
        LEFT JOIN public.profiles p
          ON p.id = auth.uid()
         AND p.family_id = fsy.family_id
        LEFT JOIN public.family_members fm
          ON fm.user_id = auth.uid()
         AND fm.family_id = fsy.family_id
        WHERE fsy.id = family_school_terms.family_school_year_id
          AND (p.id IS NOT NULL OR fm.user_id IS NOT NULL)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.family_school_years fsy
        LEFT JOIN public.profiles p
          ON p.id = auth.uid()
         AND p.family_id = fsy.family_id
        LEFT JOIN public.family_members fm
          ON fm.user_id = auth.uid()
         AND fm.family_id = fsy.family_id
        WHERE fsy.id = family_school_terms.family_school_year_id
          AND (p.id IS NOT NULL OR fm.user_id IS NOT NULL)
      )
    );

  CREATE POLICY family_school_terms_delete
    ON public.family_school_terms
    FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.family_school_years fsy
        LEFT JOIN public.profiles p
          ON p.id = auth.uid()
         AND p.family_id = fsy.family_id
        LEFT JOIN public.family_members fm
          ON fm.user_id = auth.uid()
         AND fm.family_id = fsy.family_id
        WHERE fsy.id = family_school_terms.family_school_year_id
          AND (p.id IS NOT NULL OR fm.user_id IS NOT NULL)
      )
    );
END
$$;
