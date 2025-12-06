-- Fix RLS policies and schema issues
-- Addresses: child_documents, backlog_items, syllabi permissions, family_members recursion, uploads.filename

-- ============================================================
-- 1. Fix child_documents RLS policies
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS documents_select ON child_documents;
DROP POLICY IF EXISTS documents_insert ON child_documents;
DROP POLICY IF EXISTS documents_update ON child_documents;
DROP POLICY IF EXISTS documents_delete ON child_documents;

-- Create simpler policies that use helper functions
CREATE POLICY documents_select ON child_documents
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY documents_insert ON child_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM children c
            WHERE c.id = child_id
            AND c.family_id = child_documents.family_id
        )
    );

CREATE POLICY documents_update ON child_documents
    FOR UPDATE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY documents_delete ON child_documents
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Grant service_role full access (for backend admin client)
GRANT ALL ON child_documents TO service_role;
GRANT ALL ON child_support_profiles TO service_role;
GRANT ALL ON child_cards_generated TO service_role;

-- ============================================================
-- 2. Fix backlog_items RLS policies
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS backlog_items_select ON backlog_items;
DROP POLICY IF EXISTS backlog_items_insert ON backlog_items;
DROP POLICY IF EXISTS backlog_items_update ON backlog_items;
DROP POLICY IF EXISTS backlog_items_delete ON backlog_items;

-- Create policies using helper function
CREATE POLICY backlog_items_select ON backlog_items
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY backlog_items_insert ON backlog_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY backlog_items_update ON backlog_items
    FOR UPDATE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY backlog_items_delete ON backlog_items
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Grant service_role full access
GRANT ALL ON backlog_items TO service_role;

-- ============================================================
-- 3. Fix syllabi RLS policies
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE syllabi ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS syllabi_select ON syllabi;
DROP POLICY IF EXISTS syllabi_all ON syllabi;

-- Create policies
CREATE POLICY syllabi_select ON syllabi
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY syllabi_insert ON syllabi
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY syllabi_update ON syllabi
    FOR UPDATE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY syllabi_delete ON syllabi
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Grant service_role full access
GRANT ALL ON syllabi TO service_role;

-- ============================================================
-- 4. Fix family_members infinite recursion
-- ============================================================

-- Ensure is_family_member and is_family_parent functions exist and use SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_parent(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
      AND fm.member_role = 'parent'
  )
  -- Fallback: if no family_members entry, check profiles.role
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
      AND (p.role = 'parent' OR p.role IS NULL) -- NULL defaults to parent
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO service_role;

-- Drop existing policies that might cause recursion
DROP POLICY IF EXISTS "Parents can view family memberships" ON family_members;
DROP POLICY IF EXISTS "Parents can manage family memberships" ON family_members;
DROP POLICY IF EXISTS "Users can view own membership" ON family_members;
DROP POLICY IF EXISTS "Users can update own membership" ON family_members;

-- Create new policies using helper functions (which bypass RLS)
CREATE POLICY "Parents can view family memberships" ON family_members
  FOR SELECT
  TO authenticated
  USING (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  );

CREATE POLICY "Parents can manage family memberships" ON family_members
  FOR ALL
  TO authenticated
  USING (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  )
  WITH CHECK (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  );

-- Users can view/update their own membership
CREATE POLICY "Users can view own membership" ON family_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own membership" ON family_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Grant service_role full access
GRANT ALL ON family_members TO service_role;

-- ============================================================
-- 5. Add filename column to uploads table (if it doesn't exist)
-- ============================================================

-- Check if column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'uploads' 
        AND column_name = 'filename'
    ) THEN
        ALTER TABLE uploads ADD COLUMN filename TEXT;
        -- Populate filename from storage_path if possible
        UPDATE uploads 
        SET filename = substring(storage_path from '[^/]+$')
        WHERE filename IS NULL AND storage_path IS NOT NULL;
    END IF;
END $$;

-- ============================================================
-- 6. Ensure all tables have proper grants for service_role
-- ============================================================

GRANT ALL ON child_documents TO service_role;
GRANT ALL ON child_support_profiles TO service_role;
GRANT ALL ON child_cards_generated TO service_role;
GRANT ALL ON backlog_items TO service_role;
GRANT ALL ON syllabi TO service_role;
GRANT ALL ON family_members TO service_role;
GRANT ALL ON uploads TO service_role;

-- ============================================================
-- 7. Comments
-- ============================================================

COMMENT ON POLICY documents_select ON child_documents IS 'Allow authenticated users to view documents for their family';
COMMENT ON POLICY backlog_items_select ON backlog_items IS 'Allow authenticated users to view backlog items for their family';
COMMENT ON POLICY syllabi_select ON syllabi IS 'Allow authenticated users to view syllabi for their family';

