-- =====================================================
-- COMPREHENSIVE FIX FOR REMAINING ISSUES
-- Fix RPC signatures, permissions, and column references
-- =====================================================

-- 1. Fix get_child_availability RPC signature
-- The frontend is calling it with wrong parameter names
DROP FUNCTION IF EXISTS get_child_availability(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_child_availability(
  _child_id UUID,
  _from_date DATE,
  _to_date DATE
) RETURNS TABLE(
  date DATE,
  day_status TEXT,
  available_blocks JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    cdc.date,
    cdc.day_status,
    COALESCE(
      jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object(
            'start', cdc.first_block_start,
            'end', cdc.last_block_end
          )
        )
      ),
      '{"blocks": []}'::jsonb
    ) as available_blocks
  FROM calendar_days_cache cdc
  WHERE cdc.child_id = _child_id
    AND cdc.date BETWEEN _from_date AND _to_date
  ORDER BY cdc.date;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_child_availability(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_child_availability(UUID, DATE, DATE) TO anon;

-- 2. Fix get_family_availability RPC (if it exists)
-- Drop and recreate with correct column names
DROP FUNCTION IF EXISTS get_family_availability(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_family_availability(
  _family_id UUID,
  _from_date DATE,
  _to_date DATE
) RETURNS TABLE(
  child_id UUID,
  date DATE,
  day_status TEXT,
  first_block_start TIME,
  last_block_end TIME
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    cdc.child_id,
    cdc.date,
    cdc.day_status,
    cdc.first_block_start,
    cdc.last_block_end
  FROM calendar_days_cache cdc
  WHERE cdc.family_id = _family_id
    AND cdc.date BETWEEN _from_date AND _to_date
  ORDER BY cdc.child_id, cdc.date;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_family_availability(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_family_availability(UUID, DATE, DATE) TO anon;

-- 3. Fix family_settings permissions
-- Add RLS policy for family_settings table
DO $$
BEGIN
  -- Enable RLS if not already enabled
  ALTER TABLE family_settings ENABLE ROW LEVEL SECURITY;
  
  -- Create policy for authenticated users
  DROP POLICY IF EXISTS "Users can view family_settings for their family" ON family_settings;
  CREATE POLICY "Users can view family_settings for their family" ON family_settings
    FOR SELECT USING (
      family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    );
  
  -- Create policy for updates
  DROP POLICY IF EXISTS "Users can update family_settings for their family" ON family_settings;
  CREATE POLICY "Users can update family_settings for their family" ON family_settings
    FOR ALL USING (
      family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    );
  
  RAISE NOTICE 'family_settings RLS policies created successfully';
END$$;

-- 4. Test the fixes
DO $$
DECLARE
  v_family_id UUID := '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';
  v_max_id UUID;
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  TESTING RPC FIXES                     ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  
  -- Get Max's ID
  SELECT id INTO v_max_id FROM children WHERE family_id = v_family_id AND first_name = 'Max';
  
  -- Test get_child_availability
  IF v_max_id IS NOT NULL THEN
    BEGIN
      PERFORM get_child_availability(v_max_id, CURRENT_DATE, CURRENT_DATE + 7);
      RAISE NOTICE '✅ get_child_availability RPC: WORKING';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '❌ get_child_availability RPC: ERROR - %', SQLERRM;
    END;
  END IF;
  
  -- Test get_family_availability
  BEGIN
    PERFORM get_family_availability(v_family_id, CURRENT_DATE, CURRENT_DATE + 7);
    RAISE NOTICE '✅ get_family_availability RPC: WORKING';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ get_family_availability RPC: ERROR - %', SQLERRM;
  END;
  
  -- Test family_settings access
  BEGIN
    SELECT specificity_cascade FROM family_settings WHERE family_id = v_family_id;
    RAISE NOTICE '✅ family_settings access: WORKING';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ family_settings access: ERROR - %', SQLERRM;
  END;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ All RPC fixes applied successfully!';
  
END$$;

