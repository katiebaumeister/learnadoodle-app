-- Make Standard the default child permission profile for new records.

DO $$
BEGIN
  IF to_regclass('public.family_user_controls') IS NOT NULL THEN
    ALTER TABLE public.family_user_controls
      ALTER COLUMN child_default_profile SET DEFAULT 'standard';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.children') IS NOT NULL THEN
    ALTER TABLE public.children
      ALTER COLUMN permission_profile SET DEFAULT 'standard';
  END IF;
END $$;
