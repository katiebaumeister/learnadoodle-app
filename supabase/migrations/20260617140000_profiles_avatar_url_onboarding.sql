-- Ensure parent profile fields used during onboarding exist on profiles.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Bundled avatar key (prof1–prof10) or external image URL for the signed-in user.';
