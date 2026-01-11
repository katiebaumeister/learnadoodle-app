-- ============================================================================
-- Drop uploads table after migration to materials
-- ============================================================================
-- This migration drops the uploads table after all data has been migrated
-- to the materials table and code has been updated to use materials.
--
-- IMPORTANT: Only run this after:
-- 1. Migration 2025_consolidate_uploads_into_materials.sql has been applied
-- 2. All code has been updated to use materials table instead of uploads
-- 3. You've verified that the uploads_legacy view is no longer needed

-- Step 1: Drop dependent objects first
-- Drop any functions that reference uploads table
DO $$
BEGIN
  -- Drop create_upload_record RPC if it exists (should be replaced with createFileMaterial)
  DROP FUNCTION IF EXISTS create_upload_record(UUID, UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, TEXT[], TEXT);
  
  -- Drop get_uploads RPC if it exists (should query materials instead)
  DROP FUNCTION IF EXISTS get_uploads(UUID, TEXT, UUID[], UUID[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, INT);
  
  -- Drop any other functions that specifically reference uploads table
  -- (Add more as needed based on your schema)
END $$;

-- Step 2: Drop foreign key constraints from other tables that reference uploads
-- Check if portfolio_evidence_links table exists and has upload_id foreign key
DO $$
BEGIN
  -- Check if portfolio_evidence_links exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'portfolio_evidence_links'
  ) THEN
    -- Drop foreign key constraint if it exists
    ALTER TABLE portfolio_evidence_links 
    DROP CONSTRAINT IF EXISTS portfolio_evidence_links_upload_id_fkey;
    
    -- Note: portfolio_evidence_links.upload_id should now reference materials.id
    -- You may want to add a new constraint:
    -- ALTER TABLE portfolio_evidence_links 
    --   ADD CONSTRAINT portfolio_evidence_links_material_id_fkey 
    --   FOREIGN KEY (upload_id) REFERENCES materials(id) ON DELETE CASCADE;
    -- 
    -- Or rename the column first:
    -- ALTER TABLE portfolio_evidence_links RENAME COLUMN upload_id TO material_id;
  END IF;
END $$;

-- Step 3: Handle syllabi.upload_id (if it references uploads)
-- Note: The upload_id in syllabi table now points to materials.id after migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'syllabi'
  ) THEN
    -- Drop old constraint if it exists
    ALTER TABLE syllabi 
    DROP CONSTRAINT IF EXISTS syllabi_upload_id_fkey;
    
    -- Note: upload_id column still exists in syllabi, but now contains materials.id values
    -- You may want to add a constraint to materials or rename the column later
  END IF;
END $$;

-- Step 3b: Handle skill_evidence.upload_id (if it references uploads)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'skill_evidence'
  ) THEN
    -- Drop foreign key constraint if it exists
    ALTER TABLE skill_evidence 
    DROP CONSTRAINT IF EXISTS skill_evidence_upload_id_fkey;
    
    -- Note: upload_id column now contains materials.id values after migration
    -- The constraint check ensures at least one evidence source exists
  END IF;
END $$;

-- Step 4: Drop RLS policies on uploads table
DROP POLICY IF EXISTS family_read_own_uploads ON uploads;
DROP POLICY IF EXISTS family_insert_own_uploads ON uploads;
DROP POLICY IF EXISTS family_update_own_uploads ON uploads;
DROP POLICY IF EXISTS family_delete_own_uploads ON uploads;
DROP POLICY IF EXISTS uploads_select ON uploads;
DROP POLICY IF EXISTS uploads_insert ON uploads;
DROP POLICY IF EXISTS uploads_update ON uploads;
DROP POLICY IF EXISTS uploads_delete ON uploads;
-- Drop any other uploads policies that might exist
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'uploads'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON uploads', pol.policyname);
  END LOOP;
END $$;

-- Step 4b: Update portfolio_evidence_links RLS policies that reference uploads
-- These policies use subqueries on uploads table, need to update to use materials
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'portfolio_evidence_links'
  ) THEN
    -- Drop old policies that reference uploads
    DROP POLICY IF EXISTS portfolio_links_select ON portfolio_evidence_links;
    DROP POLICY IF EXISTS portfolio_links_insert ON portfolio_evidence_links;
    DROP POLICY IF EXISTS portfolio_links_delete ON portfolio_evidence_links;
    
    -- Create new policies that reference materials instead
    -- Note: upload_id in portfolio_evidence_links now contains materials.id values
    CREATE POLICY portfolio_links_select ON portfolio_evidence_links
      FOR SELECT USING (
        is_family_member((SELECT family_id FROM materials WHERE id = upload_id AND deleted_at IS NULL))
      );
    
    CREATE POLICY portfolio_links_insert ON portfolio_evidence_links
      FOR INSERT WITH CHECK (
        is_family_member((SELECT family_id FROM materials WHERE id = upload_id AND deleted_at IS NULL))
      );
    
    CREATE POLICY portfolio_links_delete ON portfolio_evidence_links
      FOR DELETE USING (
        is_family_member((SELECT family_id FROM materials WHERE id = upload_id AND deleted_at IS NULL))
      );
  END IF;
END $$;

-- Step 5: Drop indexes on uploads table
-- Note: Primary key indexes are automatically dropped with the table, so we exclude them
DROP INDEX IF EXISTS uploads_family_created_idx;
DROP INDEX IF EXISTS uploads_child_created_idx;
DROP INDEX IF EXISTS uploads_family_subject_created_idx;
DROP INDEX IF EXISTS uploads_family_child_null_created_idx;
DROP INDEX IF EXISTS uploads_family_subject_null_created_idx;
DROP INDEX IF EXISTS uploads_event_id_idx;
DROP INDEX IF EXISTS uploads_storage_path_idx;
DROP INDEX IF EXISTS idx_portfolio_links_upload;
DROP INDEX IF EXISTS idx_uploads_subject;
DROP INDEX IF EXISTS idx_uploads_child;
-- Drop any other uploads indexes (excluding constraint-backed indexes like primary keys)
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN 
    SELECT i.indexname 
    FROM pg_indexes i
    WHERE i.schemaname = 'public' 
      AND i.tablename = 'uploads'
      -- Exclude indexes that are backing constraints (primary keys, unique constraints)
      AND NOT EXISTS (
        SELECT 1 
        FROM pg_constraint c
        JOIN pg_class cls ON cls.oid = c.conindid
        WHERE cls.relname = i.indexname
      )
  LOOP
    BEGIN
      EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
    EXCEPTION WHEN OTHERS THEN
      -- Skip if index can't be dropped (e.g., constraint-backed)
      NULL;
    END;
  END LOOP;
END $$;

-- Step 6: Drop views that reference uploads table
DROP VIEW IF EXISTS uploads_legacy;
DROP VIEW IF EXISTS v_upload_stats; -- If this view exists, it references uploads table

-- Step 7: Revoke permissions (cleanup) - do this before dropping the table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'uploads'
  ) THEN
    REVOKE ALL ON uploads FROM authenticated;
    REVOKE ALL ON uploads FROM service_role;
    REVOKE ALL ON uploads FROM anon;
  END IF;
END $$;

-- Step 8: Drop the uploads table
-- This will fail if there are still foreign key references
-- Make sure to handle all dependencies above
DROP TABLE IF EXISTS uploads CASCADE;

-- Step 9: Log completion
DO $$
BEGIN
  RAISE NOTICE 'Uploads table has been dropped successfully';
  RAISE NOTICE 'All uploads data is now in the materials table';
  RAISE NOTICE 'Make sure all code references have been updated to use materials table';
END $$;

