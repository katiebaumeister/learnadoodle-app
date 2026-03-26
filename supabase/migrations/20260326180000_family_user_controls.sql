-- Per-family permissions for linked children and tutors (events, subjects, profile, materials, plans, planning prefs).

DO $$
BEGIN
  IF to_regclass('public.family_user_controls') IS NULL THEN
    CREATE TABLE public.family_user_controls (
      family_id uuid NOT NULL PRIMARY KEY,
      can_add_edit_events boolean NOT NULL DEFAULT true,
      can_add_edit_subjects boolean NOT NULL DEFAULT true,
      can_add_edit_child_profile boolean NOT NULL DEFAULT true,
      can_add_edit_materials boolean NOT NULL DEFAULT true,
      can_add_edit_plans boolean NOT NULL DEFAULT true,
      can_change_planning_preferences boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    COMMENT ON TABLE public.family_user_controls IS
      'Parent-configured caps on what child/tutor accounts may edit in this family.';
  END IF;
END $$;

ALTER TABLE public.family_user_controls ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_user_controls TO authenticated;

-- Drop existing policies (idempotent re-run)
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.family_user_controls') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'family_user_controls'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.family_user_controls', r.policyname);
  END LOOP;
END $$;

-- SELECT: any authenticated member of the family (parent, child, tutor) via profiles or family_members
CREATE POLICY family_user_controls_select_family
  ON public.family_user_controls
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id IS NOT NULL
        AND p.family_id = family_user_controls.family_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.family_id = family_user_controls.family_id
    )
  );

-- INSERT / UPDATE: parents only (same pattern as child_support_profiles parent checks)
CREATE POLICY family_user_controls_insert_parent
  ON public.family_user_controls
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = family_user_controls.family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_user_controls.family_id
        AND LOWER(TRIM(COALESCE(p.role, ''))) = 'parent'
    )
  );

CREATE POLICY family_user_controls_update_parent
  ON public.family_user_controls
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = family_user_controls.family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_user_controls.family_id
        AND LOWER(TRIM(COALESCE(p.role, ''))) = 'parent'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = family_user_controls.family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_user_controls.family_id
        AND LOWER(TRIM(COALESCE(p.role, ''))) = 'parent'
    )
  );

-- Optional: parents may delete row (re-create via upsert); rarely needed
CREATE POLICY family_user_controls_delete_parent
  ON public.family_user_controls
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = family_user_controls.family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_user_controls.family_id
        AND LOWER(TRIM(COALESCE(p.role, ''))) = 'parent'
    )
  );

CREATE OR REPLACE FUNCTION public.family_user_controls_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_user_controls_updated_at ON public.family_user_controls;
CREATE TRIGGER trg_family_user_controls_updated_at
  BEFORE INSERT OR UPDATE ON public.family_user_controls
  FOR EACH ROW
  EXECUTE PROCEDURE public.family_user_controls_set_updated_at();
