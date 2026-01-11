-- Fix Storage Bucket RLS for File Uploads
-- Run this in Supabase SQL Editor to allow authenticated users to upload files

-- ============================================================================
-- STEP 1: Ensure the 'evidence' bucket exists
-- ============================================================================
-- Go to Supabase Dashboard → Storage → Create bucket named "evidence" (Private)

-- ============================================================================
-- STEP 2: Set up Storage RLS Policies
-- ============================================================================

-- Read Policy: Users can read files from their family's folder
DROP POLICY IF EXISTS "evidence read" ON storage.objects;
CREATE POLICY "evidence read" ON storage.objects 
FOR SELECT
USING (
  bucket_id = 'evidence' 
  AND (
    -- Allow if metadata has family_id and user is a family member
    (metadata->>'family_id')::UUID IS NOT NULL 
    AND is_family_member((metadata->>'family_id')::UUID)
  )
  OR
  -- Allow if path starts with user's family_id (fallback for files without metadata)
  (name LIKE (SELECT family_id::text || '/%' FROM profiles WHERE id = auth.uid()))
);

-- Write Policy: Users can upload files to their family's folder
DROP POLICY IF EXISTS "evidence write" ON storage.objects;
CREATE POLICY "evidence write" ON storage.objects 
FOR INSERT
WITH CHECK (
  bucket_id = 'evidence' 
  AND (
    -- Allow if metadata has family_id and user is a family member
    ((metadata->>'family_id')::UUID IS NOT NULL 
     AND is_family_member((metadata->>'family_id')::UUID))
    OR
    -- Allow if path starts with user's family_id (fallback)
    (name LIKE (SELECT family_id::text || '/%' FROM profiles WHERE id = auth.uid()))
  )
);

-- Update Policy: Users can update files in their family's folder
DROP POLICY IF EXISTS "evidence update" ON storage.objects;
CREATE POLICY "evidence update" ON storage.objects 
FOR UPDATE
USING (
  bucket_id = 'evidence' 
  AND (
    (metadata->>'family_id')::UUID IS NOT NULL 
    AND is_family_member((metadata->>'family_id')::UUID)
  )
  OR
  (name LIKE (SELECT family_id::text || '/%' FROM profiles WHERE id = auth.uid()))
)
WITH CHECK (
  bucket_id = 'evidence' 
  AND (
    (metadata->>'family_id')::UUID IS NOT NULL 
    AND is_family_member((metadata->>'family_id')::UUID)
  )
  OR
  (name LIKE (SELECT family_id::text || '/%' FROM profiles WHERE id = auth.uid()))
);

-- Delete Policy: Users can delete files from their family's folder
DROP POLICY IF EXISTS "evidence delete" ON storage.objects;
CREATE POLICY "evidence delete" ON storage.objects 
FOR DELETE
USING (
  bucket_id = 'evidence' 
  AND (
    (metadata->>'family_id')::UUID IS NOT NULL 
    AND is_family_member((metadata->>'family_id')::UUID)
  )
  OR
  (name LIKE (SELECT family_id::text || '/%' FROM profiles WHERE id = auth.uid()))
);

-- ============================================================================
-- ALTERNATIVE: Simpler Policy (if above doesn't work)
-- ============================================================================
-- If the family-based policies above don't work, uncomment this simpler version:

/*
-- Simpler policy: Allow all authenticated users to upload/read
DROP POLICY IF EXISTS "evidence write" ON storage.objects;
CREATE POLICY "evidence write" ON storage.objects 
FOR INSERT
WITH CHECK (
  bucket_id = 'evidence' 
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "evidence read" ON storage.objects;
CREATE POLICY "evidence read" ON storage.objects 
FOR SELECT
USING (
  bucket_id = 'evidence' 
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "evidence update" ON storage.objects;
CREATE POLICY "evidence update" ON storage.objects 
FOR UPDATE
USING (bucket_id = 'evidence' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "evidence delete" ON storage.objects;
CREATE POLICY "evidence delete" ON storage.objects 
FOR DELETE
USING (bucket_id = 'evidence' AND auth.role() = 'authenticated');
*/

-- ============================================================================
-- VERIFY: Check that policies were created
-- ============================================================================
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname LIKE 'evidence%'
ORDER BY policyname;
