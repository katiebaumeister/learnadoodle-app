-- ============================================================================
-- Consolidate uploads table into materials table
-- ============================================================================
-- This migration merges the uploads table into materials to create a unified
-- system for all file resources with consistent soft delete support

-- Step 1: Add upload-specific columns to materials table
DO $$
BEGIN
  -- Add storage_path (for files stored in evidence bucket)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE materials ADD COLUMN storage_path TEXT NULL;
    COMMENT ON COLUMN materials.storage_path IS 'Path to file in evidence bucket storage';
  END IF;

  -- Add mime type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'mime'
  ) THEN
    ALTER TABLE materials ADD COLUMN mime TEXT NULL DEFAULT 'application/octet-stream';
  END IF;

  -- Add file size in bytes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'bytes'
  ) THEN
    ALTER TABLE materials ADD COLUMN bytes INT NULL DEFAULT 0;
  END IF;

  -- Add caption (from uploads)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'caption'
  ) THEN
    ALTER TABLE materials ADD COLUMN caption TEXT NULL;
  END IF;

  -- Add child_id (for uploads that are child-specific)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE materials ADD COLUMN child_id UUID NULL REFERENCES children(id) ON DELETE SET NULL;
    COMMENT ON COLUMN materials.child_id IS 'Child-specific uploads (NULL for family-wide materials)';
  END IF;

  -- Add subject_id (from uploads)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'subject_id'
  ) THEN
    ALTER TABLE materials ADD COLUMN subject_id UUID NULL;
    COMMENT ON COLUMN materials.subject_id IS 'Subject-specific uploads';
  END IF;

  -- Add event_id (from uploads - for uploads linked to events)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE materials ADD COLUMN event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL;
    COMMENT ON COLUMN materials.event_id IS 'Event-specific uploads';
  END IF;

  -- Add display_order (from uploads)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE materials ADD COLUMN display_order INT NOT NULL DEFAULT 0;
  END IF;

  -- Add url (alternative to storage_path, for external URLs)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'url'
  ) THEN
    ALTER TABLE materials ADD COLUMN url TEXT NULL;
  END IF;

  -- Add updated_at if it doesn't exist (materials should have this, but check)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE materials ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;
  END IF;

  -- Rename archived_at to deleted_at for consistency (or add deleted_at if archived_at doesn't exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'archived_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'deleted_at'
  ) THEN
    -- Rename archived_at to deleted_at
    ALTER TABLE materials RENAME COLUMN archived_at TO deleted_at;
    COMMENT ON COLUMN materials.deleted_at IS 'Soft delete timestamp (NULL = active, timestamp = deleted)';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'deleted_at'
  ) THEN
    -- Add deleted_at if it doesn't exist
    ALTER TABLE materials ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN materials.deleted_at IS 'Soft delete timestamp (NULL = active, timestamp = deleted)';
  END IF;
END $$;

-- Step 2: Create indexes for new columns
CREATE INDEX IF NOT EXISTS materials_storage_path_idx ON materials(storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_child_id_idx ON materials(child_id) WHERE child_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_subject_id_idx ON materials(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_event_id_idx ON materials(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_deleted_at_idx ON materials(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS materials_family_deleted_idx ON materials(family_id, deleted_at) WHERE deleted_at IS NULL;

-- Step 3: Migrate data from uploads to materials
-- Convert uploads to materials entries
INSERT INTO materials (
  id,
  family_id,
  title,
  type,
  storage_path,
  mime,
  bytes,
  caption,
  child_id,
  subject_id,
  event_id,
  display_order,
  provider_url,
  tags,
  notes,
  created_by,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  u.id,
  u.family_id,
  u.title,
  'other'::text, -- Default type for uploads
  u.storage_path,
  u.mime,
  u.bytes,
  u.caption,
  u.child_id,
  u.subject_id,
  u.event_id,
  COALESCE(u.display_order, 0),
  u.url, -- Map uploads.url to provider_url
  COALESCE(u.tags, '{}'),
  u.notes,
  u.created_by,
  u.created_at,
  COALESCE(u.created_at, now()),
  NULL -- All migrated uploads are active (not deleted)
FROM uploads u
WHERE NOT EXISTS (
  SELECT 1 FROM materials m WHERE m.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Update foreign key references in events table
-- Check if events table has material_id or materials_attachment_ids columns
DO $$
BEGIN
  -- Update events.material_id references (if they point to uploads, map to materials)
  -- This is handled automatically since we're using the same IDs
  
  -- Note: materials_attachment_ids in events table is an array field
  -- that should already contain material IDs, so no migration needed there
END $$;

-- Step 5: Create a view for backward compatibility (temporary, can be removed later)
CREATE OR REPLACE VIEW uploads_legacy AS
SELECT 
  id,
  family_id,
  child_id,
  subject_id,
  event_id,
  storage_path,
  mime,
  bytes,
  title,
  caption,
  tags,
  notes,
  display_order,
  url,
  created_by,
  created_at
FROM materials
WHERE storage_path IS NOT NULL OR url IS NOT NULL; -- Only show file-based materials

COMMENT ON VIEW uploads_legacy IS 'Legacy view for backward compatibility during migration - use materials table instead';

-- Step 6: Update RLS policies to use deleted_at instead of archived_at
DROP POLICY IF EXISTS family_read_own_materials ON materials;
CREATE POLICY family_read_own_materials
ON materials
FOR SELECT
USING (is_family_member(family_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS family_insert_own_materials ON materials;
CREATE POLICY family_insert_own_materials
ON materials
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_materials ON materials;
CREATE POLICY family_update_own_materials
ON materials
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_materials ON materials;
CREATE POLICY family_delete_own_materials
ON materials
FOR DELETE
USING (is_family_member(family_id));

-- Step 7: Create function to soft delete materials (replaces archiveMaterial)
CREATE OR REPLACE FUNCTION delete_material(_material_id UUID, _family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_count INT;
BEGIN
  -- Verify family membership
  IF NOT is_family_member(_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Soft delete by setting deleted_at
  UPDATE materials
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = _material_id
    AND family_id = _family_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  IF _updated_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Material not found or already deleted');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', _material_id);
END;
$$;

COMMENT ON FUNCTION delete_material IS 'Soft delete a material by setting deleted_at timestamp';

-- Step 8: Create function to restore deleted materials
CREATE OR REPLACE FUNCTION restore_material(_material_id UUID, _family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_count INT;
BEGIN
  -- Verify family membership
  IF NOT is_family_member(_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Restore by clearing deleted_at
  UPDATE materials
  SET deleted_at = NULL,
      updated_at = now()
  WHERE id = _material_id
    AND family_id = _family_id
    AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  IF _updated_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Material not found or not deleted');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', _material_id);
END;
$$;

COMMENT ON FUNCTION restore_material IS 'Restore a soft-deleted material by clearing deleted_at';

-- Step 9: Grant permissions
GRANT EXECUTE ON FUNCTION delete_material(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restore_material(UUID, UUID) TO authenticated, service_role;

-- Step 10: Add trigger to update updated_at on material changes
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS materials_updated_at_trigger ON materials;
CREATE TRIGGER materials_updated_at_trigger
  BEFORE UPDATE ON materials
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

-- Step 11: Create migration log entry (optional, for tracking)
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Consolidated uploads into materials table';
  RAISE NOTICE 'All uploads have been migrated to materials with deleted_at soft delete support';
  RAISE NOTICE 'The uploads table can now be deprecated (but keep it for now for backward compatibility)';
END $$;

-- NOTE: After verifying the migration works correctly, you can:
-- 1. Update all code to use materials table instead of uploads
-- 2. Drop the uploads_legacy view
-- 3. Eventually drop the uploads table (but keep a backup first!)

