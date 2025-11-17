-- Storage Policies for state_blackouts bucket
-- Part of Phase 1 - Year-Round Intelligence Core (Chunk G)
-- Allows public read access (as specified) but restricts writes to service_role/admin

-- IMPORTANT: First create the bucket via Supabase Dashboard:
-- 1. Go to Storage → New bucket
-- 2. Name: "state_blackouts"
-- 3. Public bucket: CHECKED (allows public read) - RECOMMENDED
--    OR leave unchecked (private) and use the read policy below
-- 4. Click "Create bucket"

-- Storage RLS Policies for state_blackouts bucket

-- Option 1: If bucket is PUBLIC (recommended per spec)
-- No read policy needed - public buckets allow public reads automatically
-- But we still restrict writes to service_role only

-- Option 2: If bucket is PRIVATE
-- Uncomment the read policy below to allow authenticated reads
-- DROP POLICY IF EXISTS "state_blackouts read" ON storage.objects;
-- CREATE POLICY "state_blackouts read" ON storage.objects
-- FOR SELECT
-- USING (bucket_id = 'state_blackouts');

-- Restrict writes to service_role/admin only (via backend)
-- This prevents unauthorized uploads while allowing public reads
DROP POLICY IF EXISTS "state_blackouts write" ON storage.objects;
CREATE POLICY "state_blackouts write" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'state_blackouts'
  AND auth.role() = 'service_role'
);

DROP POLICY IF EXISTS "state_blackouts update" ON storage.objects;
CREATE POLICY "state_blackouts update" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'state_blackouts'
  AND auth.role() = 'service_role'
)
WITH CHECK (
  bucket_id = 'state_blackouts'
  AND auth.role() = 'service_role'
);

DROP POLICY IF EXISTS "state_blackouts delete" ON storage.objects;
CREATE POLICY "state_blackouts delete" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'state_blackouts'
  AND auth.role() = 'service_role'
);

-- Grant necessary permissions
-- Note: service_role already has full access, but we document it here
-- Public read is handled by the SELECT policy above

-- Verify policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'objects'
  AND policyname LIKE 'state_blackouts%'
ORDER BY policyname;

