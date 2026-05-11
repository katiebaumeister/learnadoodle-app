-- Store parent-defined tutor labels separately from login email.

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    ALTER TABLE public.family_members
      ADD COLUMN IF NOT EXISTS display_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    ALTER TABLE public.invites
      ADD COLUMN IF NOT EXISTS invited_name text;
  END IF;
END $$;
