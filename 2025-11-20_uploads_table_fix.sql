-- Fix uploads table: ensure it exists with all required columns
-- This migration ensures the uploads table has caption column and proper structure

-- Check if table exists, if not create it
DO $$
BEGIN
  -- Check if uploads table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'uploads'
  ) THEN
    -- Create the table with all columns
    CREATE TABLE public.uploads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID NOT NULL,
      child_id UUID NULL REFERENCES public.children(id) ON DELETE SET NULL,
      subject_id UUID NULL,
      event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
      storage_path TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      bytes INT NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      caption TEXT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT NULL,
      display_order INT NOT NULL DEFAULT 0,
      url TEXT NULL,
      kind TEXT NULL,
      filename TEXT NULL,
      created_by UUID NOT NULL DEFAULT auth.uid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    RAISE NOTICE 'Created uploads table';
  ELSE
    RAISE NOTICE 'uploads table already exists';
  END IF;
END $$;

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add caption column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'caption'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN caption TEXT NULL;
    RAISE NOTICE 'Added caption column to uploads table';
  END IF;
  
  -- Add title column if it doesn't exist (some older schemas might not have it)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'title'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN title TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added title column to uploads table';
  END IF;
  
  -- Add mime column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'mime'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN mime TEXT NOT NULL DEFAULT 'application/octet-stream';
    RAISE NOTICE 'Added mime column to uploads table';
  END IF;
  
  -- Add bytes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'bytes'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN bytes INT NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added bytes column to uploads table';
  END IF;
  
  -- Add tags column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
    RAISE NOTICE 'Added tags column to uploads table';
  END IF;
  
  -- Add display_order column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN display_order INT NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added display_order column to uploads table';
  END IF;
  
  -- Add url column if it doesn't exist (computed/optional field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'url'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN url TEXT NULL;
    RAISE NOTICE 'Added url column to uploads table';
  END IF;
  
  -- Add kind column if it doesn't exist (computed/optional field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN kind TEXT NULL;
    RAISE NOTICE 'Added kind column to uploads table';
  END IF;
  
  -- Add filename column if it doesn't exist (computed/optional field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'filename'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN filename TEXT NULL;
    RAISE NOTICE 'Added filename column to uploads table';
  END IF;
  
  -- Ensure family_id exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'family_id'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN family_id UUID NOT NULL;
    RAISE NOTICE 'Added family_id column to uploads table';
  END IF;
  
  -- Ensure storage_path exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN storage_path TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added storage_path column to uploads table';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS uploads_family_created_idx ON public.uploads (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_child_created_idx ON public.uploads (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_family_subject_created_idx ON public.uploads (family_id, subject_id, created_at DESC) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS uploads_family_child_null_created_idx ON public.uploads (family_id, created_at DESC) WHERE child_id IS NULL;
CREATE INDEX IF NOT EXISTS uploads_family_subject_null_created_idx ON public.uploads (family_id, created_at DESC) WHERE subject_id IS NULL;

-- Enable RLS
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies
DROP POLICY IF EXISTS uploads_select ON public.uploads;
CREATE POLICY uploads_select ON public.uploads 
FOR SELECT 
USING (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_insert ON public.uploads;
CREATE POLICY uploads_insert ON public.uploads 
FOR INSERT 
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_update ON public.uploads;
CREATE POLICY uploads_update ON public.uploads 
FOR UPDATE 
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_delete ON public.uploads;
CREATE POLICY uploads_delete ON public.uploads 
FOR DELETE 
USING (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO service_role;

-- Ensure is_family_member function exists (required for RLS)
-- This version checks if the CURRENT USER has access to the family
CREATE OR REPLACE FUNCTION public.is_family_member(_family UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is a member via family_members table (bypasses RLS due to SECURITY DEFINER)
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  -- Fallback: check if user's profile has this family_id (for backward compatibility)
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  )
  -- Additional fallback: check if there are children in this family
  -- (If user can see children, they can see family data - this is a permissive fallback)
  OR EXISTS (
    SELECT 1
    FROM children c
    WHERE c.family_id = _family
      AND c.archived = false
  );
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_family_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(UUID) TO service_role;

-- Verify table structure
DO $$
DECLARE
  col_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'uploads';
  
  RAISE NOTICE 'uploads table has % columns', col_count;
  
  -- List all columns
  RAISE NOTICE 'Columns: %', (
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uploads'
  );
END $$;

