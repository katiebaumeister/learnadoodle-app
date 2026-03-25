-- Fix PostgreSQL 42P17: infinite recursion detected in policy for relation "family_members"
--
-- Cause: RLS policies on family_members that subquery family_members (directly or via a view)
-- re-enter the same policy evaluator.
--
-- Fix: Policies reference only auth.uid() and public.profiles (family_id / role), never family_members.
--
-- Apply: Supabase Dashboard → SQL Editor → run this file, or `supabase db push` if you use CLI.

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'family_members'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.family_members', r.policyname);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Read: your own row OR anyone in the same family (family_id from profiles — no recursion)
DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY family_members_select_same_family
        ON public.family_members
        FOR SELECT
        TO authenticated
        USING (
          user_id = auth.uid()
          OR family_id IN (
            SELECT p.family_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.family_id IS NOT NULL
          )
        );
    $pol$;
    EXECUTE $pol$
      CREATE POLICY family_members_insert_same_family
        ON public.family_members
        FOR INSERT
        TO authenticated
        WITH CHECK (
          family_id IN (
            SELECT p.family_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.family_id IS NOT NULL
          )
        );
    $pol$;
    EXECUTE $pol$
      CREATE POLICY family_members_update_same_family
        ON public.family_members
        FOR UPDATE
        TO authenticated
        USING (
          family_id IN (
            SELECT p.family_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.family_id IS NOT NULL
          )
        )
        WITH CHECK (
          family_id IN (
            SELECT p.family_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.family_id IS NOT NULL
          )
        );
    $pol$;
    EXECUTE $pol$
      CREATE POLICY family_members_delete_same_family
        ON public.family_members
        FOR DELETE
        TO authenticated
        USING (
          family_id IN (
            SELECT p.family_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.family_id IS NOT NULL
          )
        );
    $pol$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- invites (optional table; skip if not deployed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'invites'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.invites', r.policyname);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
  EXECUTE $pol$
    CREATE POLICY invites_select_same_family
      ON public.invites
      FOR SELECT
      TO authenticated
      USING (
        family_id IN (
          SELECT p.family_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.family_id IS NOT NULL
        )
      );
  $pol$;
  EXECUTE $pol$
    CREATE POLICY invites_insert_same_family
      ON public.invites
      FOR INSERT
      TO authenticated
      WITH CHECK (
        family_id IN (
          SELECT p.family_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.family_id IS NOT NULL
        )
      );
  $pol$;
  EXECUTE $pol$
    CREATE POLICY invites_update_same_family
      ON public.invites
      FOR UPDATE
      TO authenticated
      USING (
        family_id IN (
          SELECT p.family_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.family_id IS NOT NULL
        )
      )
      WITH CHECK (
        family_id IN (
          SELECT p.family_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.family_id IS NOT NULL
        )
      );
  $pol$;
  EXECUTE $pol$
    CREATE POLICY invites_delete_same_family
      ON public.invites
      FOR DELETE
      TO authenticated
      USING (
        family_id IN (
          SELECT p.family_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.family_id IS NOT NULL
        )
      );
  $pol$;
  END IF;
END $$;
