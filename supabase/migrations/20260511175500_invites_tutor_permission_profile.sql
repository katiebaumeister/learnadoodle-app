-- Store selected tutor permission profile on pending tutor invites.

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    ALTER TABLE public.invites
      ADD COLUMN IF NOT EXISTS tutor_permission_profile text;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'invites_tutor_permission_profile_check'
     ) THEN
    ALTER TABLE public.invites
      ADD CONSTRAINT invites_tutor_permission_profile_check
      CHECK (
        tutor_permission_profile IS NULL
        OR tutor_permission_profile IN ('viewer', 'teaching', 'manager')
      );
  END IF;
END $$;
