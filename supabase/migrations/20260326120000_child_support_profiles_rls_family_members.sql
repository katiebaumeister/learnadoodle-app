-- Broaden child_support_profiles RLS: parents often have family_id only on family_members,
-- not on profiles, so the previous policy (profiles.family_id = children.family_id) returned 403.
-- Also ensure authenticated role has table privileges (some projects omit GRANT).

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.child_support_profiles') IS NULL THEN
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_support_profiles TO authenticated;

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'child_support_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.child_support_profiles', r.policyname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.child_support_profiles ENABLE ROW LEVEL SECURITY';

  -- Parent access: profiles.family_id matches child OR user is a parent row in family_members for that family.
  EXECUTE $pol$
    CREATE POLICY child_support_profiles_select_same_family
      ON public.child_support_profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.children c
          WHERE c.id = child_support_profiles.child_id
            AND c.family_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.family_id IS NOT NULL
                  AND p.family_id = c.family_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.family_members fm
                WHERE fm.family_id = c.family_id
                  AND fm.user_id = auth.uid()
                  AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
              )
            )
        )
      );
  $pol$;

  EXECUTE $pol$
    CREATE POLICY child_support_profiles_insert_same_family
      ON public.child_support_profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.children c
          WHERE c.id = child_support_profiles.child_id
            AND c.family_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.family_id IS NOT NULL
                  AND p.family_id = c.family_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.family_members fm
                WHERE fm.family_id = c.family_id
                  AND fm.user_id = auth.uid()
                  AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
              )
            )
        )
      );
  $pol$;

  EXECUTE $pol$
    CREATE POLICY child_support_profiles_update_same_family
      ON public.child_support_profiles
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.children c
          WHERE c.id = child_support_profiles.child_id
            AND c.family_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.family_id IS NOT NULL
                  AND p.family_id = c.family_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.family_members fm
                WHERE fm.family_id = c.family_id
                  AND fm.user_id = auth.uid()
                  AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.children c
          WHERE c.id = child_support_profiles.child_id
            AND c.family_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.family_id IS NOT NULL
                  AND p.family_id = c.family_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.family_members fm
                WHERE fm.family_id = c.family_id
                  AND fm.user_id = auth.uid()
                  AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
              )
            )
        )
      );
  $pol$;

  EXECUTE $pol$
    CREATE POLICY child_support_profiles_delete_same_family
      ON public.child_support_profiles
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.children c
          WHERE c.id = child_support_profiles.child_id
            AND c.family_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.family_id IS NOT NULL
                  AND p.family_id = c.family_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.family_members fm
                WHERE fm.family_id = c.family_id
                  AND fm.user_id = auth.uid()
                  AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
              )
            )
        )
      );
  $pol$;
END $$;
