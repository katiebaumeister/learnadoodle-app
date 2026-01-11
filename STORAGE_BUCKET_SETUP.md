# Supabase Storage Bucket Setup for File Uploads

## Quick Setup (2 Steps)

### Step 1: Create the Storage Bucket

1. Go to your **Supabase Dashboard**
2. Navigate to **Storage** (left sidebar)
3. Click **"New bucket"**
4. Configure:
   - **Name**: `evidence`
   - **Public bucket**: ❌ **UNCHECKED** (make it private)
   - Click **"Create bucket"**

### Step 2: Set Up Storage RLS Policies

Run this SQL in your **Supabase SQL Editor**:

```sql
-- Storage RLS Policies for 'evidence' bucket
-- These policies allow authenticated users to upload files to their family's folder

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
  -- Allow if path starts with user's family_id
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
```

## Alternative: Simpler Policy (Less Secure)

If the above doesn't work, you can use a simpler policy that allows any authenticated user to upload to the `evidence` bucket:

```sql
-- Simpler policy: Allow all authenticated users to upload
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
```

**Note**: This simpler policy is less secure but will work immediately. You can tighten it later.

## Verify Setup

After running the SQL, test by:

1. Opening the Event Details modal
2. Going to the Syllabus tab
3. Clicking "Create new section" → "Upload PDF"
4. Selecting a PDF file

If uploads work, you're all set! If you still get RLS errors, check:

- ✅ Bucket name is exactly `evidence` (case-sensitive)
- ✅ Bucket is set to **Private** (not public)
- ✅ `is_family_member()` function exists and works
- ✅ User is authenticated (logged in)

## Step 3: Fix syllabi Table RLS (Required for Syllabus Creation)

If you get a 403 error when creating syllabi, run this additional SQL file:

**File**: `fix_syllabi_rls_permissions.sql`

This sets up RLS policies for:
- `syllabi` table (allows creating syllabi)
- `syllabus_sections` table (allows creating sections)

## Troubleshooting

### Error: "new row violates row-level security policy" (Storage)

**Cause**: Storage bucket RLS is blocking the upload.

**Solution**: 
1. Make sure you've run the SQL policies above
2. Verify the bucket name is `evidence` (exact match)
3. Check that the user is authenticated
4. Try the simpler policy if the family-based one doesn't work

### Error: "permission denied for table syllabi" (403)

**Cause**: The `syllabi` table RLS is blocking syllabus creation.

**Solution**: 
1. Run `fix_syllabi_rls_permissions.sql` in Supabase SQL Editor
2. This will set up INSERT policies for the `syllabi` and `syllabus_sections` tables

### Error: "Bucket not found"

**Cause**: The `evidence` bucket doesn't exist.

**Solution**: Create the bucket in Supabase Dashboard → Storage → New bucket

### Still Not Working?

If uploads still fail, you can:
- Use the manual section creation (enter title + URL/description)
- Upload files from the Documents section first, then link them
- Contact support to check your Supabase storage configuration






