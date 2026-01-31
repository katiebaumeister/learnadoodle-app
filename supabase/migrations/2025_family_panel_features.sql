-- Migration: Family Panel Features
-- Adds support for profile editing, parent limits, child deletion, and notifications

-- ============================================================
-- 1. Add missing columns to profiles table
-- ============================================================

-- Add name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN name text;
  END IF;
END $$;

-- Add first_name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN first_name text;
  END IF;
END $$;

-- Add phone column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE profiles ADD COLUMN phone text;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS profiles_name_idx ON profiles(name) WHERE name IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_first_name_idx ON profiles(first_name) WHERE first_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_phone_idx ON profiles(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- 2. Add family_name column to family table
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'family' AND column_name = 'family_name'
  ) THEN
    ALTER TABLE family ADD COLUMN family_name text;
  END IF;
END $$;

-- Add index for family_name
CREATE INDEX IF NOT EXISTS family_family_name_idx ON family(family_name) WHERE family_name IS NOT NULL;

-- ============================================================
-- 3. Function to check parent count (max 2 per family)
-- ============================================================

CREATE OR REPLACE FUNCTION check_parent_count(p_family_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM family_members
  WHERE family_id = p_family_id
    AND member_role = 'parent';
  
  RETURN v_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_parent_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_parent_count(uuid) TO service_role;

COMMENT ON FUNCTION check_parent_count IS 'Returns the count of parents in a family (max 2 allowed)';

-- ============================================================
-- 4. Function to validate parent invite (max 2)
-- ============================================================

CREATE OR REPLACE FUNCTION validate_parent_invite(p_family_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  v_count := check_parent_count(p_family_id);
  
  IF v_count >= 2 THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION validate_parent_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_parent_invite(uuid) TO service_role;

COMMENT ON FUNCTION validate_parent_invite IS 'Validates that a family can accept another parent (max 2)';

-- ============================================================
-- 5. Function to safely delete child and related data
-- ============================================================

CREATE OR REPLACE FUNCTION delete_child_safely(p_child_id uuid, p_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_name text;
  v_result jsonb;
BEGIN
  -- Get child name for logging
  SELECT first_name INTO v_child_name
  FROM children
  WHERE id = p_child_id AND family_id = p_family_id;
  
  IF v_child_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Child not found or does not belong to family'
    );
  END IF;
  
  -- Delete child (CASCADE will handle related records)
  DELETE FROM children
  WHERE id = p_child_id AND family_id = p_family_id;
  
  -- Check if deletion was successful
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to delete child'
    );
  END IF;
  
  -- Remove child from family_members child_scope arrays
  UPDATE family_members
  SET child_scope = array_remove(child_scope, p_child_id),
      updated_at = now()
  WHERE family_id = p_family_id
    AND p_child_id = ANY(child_scope);
  
  RETURN jsonb_build_object(
    'success', true,
    'child_name', v_child_name,
    'message', 'Child deleted successfully'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_child_safely(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_child_safely(uuid, uuid) TO service_role;

COMMENT ON FUNCTION delete_child_safely IS 'Safely deletes a child and cleans up related data';

-- ============================================================
-- 6. RLS Policies for updating profiles
-- ============================================================

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Allow service role to update profiles (for backend operations)
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
CREATE POLICY "Service role can update profiles" ON profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 7. RLS Policies for updating family table
-- ============================================================

-- Allow parents to update their family
DROP POLICY IF EXISTS "Parents can update family" ON family;
CREATE POLICY "Parents can update family" ON family
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family.id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family.id
        AND NOT EXISTS (
          SELECT 1 FROM family_members fm 
          WHERE fm.user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family.id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family.id
        AND NOT EXISTS (
          SELECT 1 FROM family_members fm 
          WHERE fm.user_id = auth.uid()
        )
    )
  );

-- ============================================================
-- 8. Notification preferences table
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id uuid REFERENCES family(id) ON DELETE CASCADE,
  email_notifications_enabled boolean DEFAULT true,
  email_frequency text DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'daily', 'weekly', 'never')),
  notification_types jsonb DEFAULT '{}'::jsonb, -- Store preferences for different notification types
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, family_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS notification_preferences_family_id_idx ON notification_preferences(family_id);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_preferences
DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
CREATE POLICY "Users can view own notification preferences" ON notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;
CREATE POLICY "Users can update own notification preferences" ON notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role can read all
DROP POLICY IF EXISTS "Service role can read all notification preferences" ON notification_preferences;
CREATE POLICY "Service role can read all notification preferences" ON notification_preferences
  FOR SELECT
  TO service_role
  USING (true);

-- ============================================================
-- 9. Trigger to update updated_at timestamp
-- ============================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for notification_preferences
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 10. Constraint to enforce max 2 parents per family
-- ============================================================

-- Create a function to check parent count before insert/update
CREATE OR REPLACE FUNCTION check_max_parents()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_count integer;
BEGIN
  -- Only check if the role is 'parent'
  IF NEW.member_role = 'parent' THEN
    SELECT COUNT(*) INTO v_parent_count
    FROM family_members
    WHERE family_id = NEW.family_id
      AND member_role = 'parent'
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF v_parent_count >= 2 THEN
      RAISE EXCEPTION 'Maximum of 2 parents allowed per family. Current count: %', v_parent_count;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to enforce max parents
DROP TRIGGER IF EXISTS enforce_max_parents ON family_members;
CREATE TRIGGER enforce_max_parents
  BEFORE INSERT OR UPDATE ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION check_max_parents();

COMMENT ON TRIGGER enforce_max_parents ON family_members IS 'Enforces maximum of 2 parents per family';

-- ============================================================
-- 11. Helper function to get family parent count
-- ============================================================

CREATE OR REPLACE FUNCTION get_family_parent_count(p_family_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM family_members
  WHERE family_id = p_family_id
    AND member_role = 'parent';
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_family_parent_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_family_parent_count(uuid) TO service_role;

COMMENT ON FUNCTION get_family_parent_count IS 'Returns the number of parents in a family';
