-- Preset-based user controls: child/tutor permission profiles with optional override scaffolding.

DO $$
BEGIN
  IF to_regclass('public.family_user_controls') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_user_controls'
        AND column_name = 'child_default_profile'
    ) THEN
      ALTER TABLE public.family_user_controls
        ADD COLUMN child_default_profile text NOT NULL DEFAULT 'guided';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_user_controls'
        AND column_name = 'custom_permissions_enabled'
    ) THEN
      ALTER TABLE public.family_user_controls
        ADD COLUMN custom_permissions_enabled boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_user_controls'
        AND column_name = 'permission_overrides'
    ) THEN
      ALTER TABLE public.family_user_controls
        ADD COLUMN permission_overrides jsonb NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.family_user_controls') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'family_user_controls_child_default_profile_check'
    ) THEN
      ALTER TABLE public.family_user_controls
        ADD CONSTRAINT family_user_controls_child_default_profile_check
        CHECK (child_default_profile IN ('guided', 'standard', 'independent'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.children') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'children'
        AND column_name = 'permission_profile'
    ) THEN
      ALTER TABLE public.children
        ADD COLUMN permission_profile text NOT NULL DEFAULT 'guided';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'children'
        AND column_name = 'custom_permissions_enabled'
    ) THEN
      ALTER TABLE public.children
        ADD COLUMN custom_permissions_enabled boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'children'
        AND column_name = 'permission_overrides'
    ) THEN
      ALTER TABLE public.children
        ADD COLUMN permission_overrides jsonb NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.children') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'children_permission_profile_check'
    ) THEN
      ALTER TABLE public.children
        ADD CONSTRAINT children_permission_profile_check
        CHECK (permission_profile IN ('guided', 'standard', 'independent'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'tutor_permission_profile'
    ) THEN
      ALTER TABLE public.family_members
        ADD COLUMN tutor_permission_profile text NOT NULL DEFAULT 'teaching';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'custom_permissions_enabled'
    ) THEN
      ALTER TABLE public.family_members
        ADD COLUMN custom_permissions_enabled boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'permission_overrides'
    ) THEN
      ALTER TABLE public.family_members
        ADD COLUMN permission_overrides jsonb NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'family_members_tutor_permission_profile_check'
    ) THEN
      ALTER TABLE public.family_members
        ADD CONSTRAINT family_members_tutor_permission_profile_check
        CHECK (tutor_permission_profile IN ('viewer', 'teaching', 'manager'));
    END IF;
  END IF;
END $$;
