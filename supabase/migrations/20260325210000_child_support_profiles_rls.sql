-- Allow authenticated parents (same family as the child) to read/write child_support_profiles.
-- Fixes 403 on EditChildModal when loading support fields via Supabase client.

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.child_support_profiles') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'child_support_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.child_support_profiles', r.policyname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.child_support_profiles ENABLE ROW LEVEL SECURITY';

  EXECUTE $pol$
    CREATE POLICY child_support_profiles_select_same_family
      ON public.child_support_profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.children c
          INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
          WHERE c.id = child_support_profiles.child_id
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
          INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
          WHERE c.id = child_support_profiles.child_id
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
          INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
          WHERE c.id = child_support_profiles.child_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.children c
          INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
          WHERE c.id = child_support_profiles.child_id
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
          INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
          WHERE c.id = child_support_profiles.child_id
        )
      );
  $pol$;
END $$;
