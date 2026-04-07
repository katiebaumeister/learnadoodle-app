-- Auth dashboard user delete failed: year_plans.created_by REFERENCES auth.users(id) without ON DELETE.
-- After this migration, deleting an auth user clears created_by on their year plans instead of blocking.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'year_plans'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.year_plans DROP CONSTRAINT IF EXISTS year_plans_created_by_fkey;

  ALTER TABLE public.year_plans
    ALTER COLUMN created_by DROP NOT NULL;

  ALTER TABLE public.year_plans
    ADD CONSTRAINT year_plans_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE SET NULL;

  COMMENT ON COLUMN public.year_plans.created_by IS
    'Auth user who created the plan; null if that account was removed.';
END $$;
