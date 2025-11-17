-- Fix RLS Policies for calendar_days_cache
-- Drops any existing policies and recreates read/write policies using family_id
-- Also grants service role full access.

DROP POLICY IF EXISTS calendar_days_cache_select ON calendar_days_cache;
DROP POLICY IF EXISTS calendar_days_cache_insert ON calendar_days_cache;
DROP POLICY IF EXISTS calendar_days_cache_update ON calendar_days_cache;
DROP POLICY IF EXISTS calendar_days_cache_delete ON calendar_days_cache;
DROP POLICY IF EXISTS calendar_days_cache_service_role ON calendar_days_cache;
DROP POLICY IF EXISTS "allow_all_read" ON calendar_days_cache;
DROP POLICY IF EXISTS "allow_all_write" ON calendar_days_cache;

ALTER TABLE calendar_days_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Create read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'calendar_days_cache_select'
      AND tablename = 'calendar_days_cache'
  ) THEN
    EXECUTE '
      CREATE POLICY calendar_days_cache_select ON calendar_days_cache
        FOR SELECT USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
          OR auth.role() = ''service_role''
        );
    ';
  END IF;

  -- Create insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'calendar_days_cache_insert'
      AND tablename = 'calendar_days_cache'
  ) THEN
    EXECUTE '
      CREATE POLICY calendar_days_cache_insert ON calendar_days_cache
        FOR INSERT WITH CHECK (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
          OR auth.role() = ''service_role''
        );
    ';
  END IF;

  -- Create update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'calendar_days_cache_update'
      AND tablename = 'calendar_days_cache'
  ) THEN
    EXECUTE '
      CREATE POLICY calendar_days_cache_update ON calendar_days_cache
        FOR UPDATE USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
          OR auth.role() = ''service_role''
        )
        WITH CHECK (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
          OR auth.role() = ''service_role''
        );
    ';
  END IF;

  -- Create delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'calendar_days_cache_delete'
      AND tablename = 'calendar_days_cache'
  ) THEN
    EXECUTE '
      CREATE POLICY calendar_days_cache_delete ON calendar_days_cache
        FOR DELETE USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
          OR auth.role() = ''service_role''
        );
    ';
  END IF;

  -- Explicit service role bypass (covers any missing policies)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'calendar_days_cache_service_role'
      AND tablename = 'calendar_days_cache'
  ) THEN
    EXECUTE '
      CREATE POLICY calendar_days_cache_service_role ON calendar_days_cache
        FOR ALL USING (auth.role() = ''service_role'')
        WITH CHECK (auth.role() = ''service_role'');
    ';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_days_cache TO authenticated;

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'calendar_days_cache'
ORDER BY policyname;


