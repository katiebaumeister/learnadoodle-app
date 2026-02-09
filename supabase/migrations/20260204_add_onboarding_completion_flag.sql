-- Migration: Add onboarding completion flag to family table
-- This flag tracks whether a family has completed the onboarding process

-- Add has_completed_onboarding column to family table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'family' AND column_name = 'has_completed_onboarding'
  ) THEN
    ALTER TABLE family ADD COLUMN has_completed_onboarding boolean DEFAULT false;
    
    -- Add comment for documentation
    COMMENT ON COLUMN family.has_completed_onboarding IS 'Indicates whether the family has completed the initial onboarding process (sign up, add children, optionally add subjects)';
  END IF;
END $$;

-- Create index for faster queries when checking onboarding status
CREATE INDEX IF NOT EXISTS idx_family_has_completed_onboarding 
ON family(has_completed_onboarding) 
WHERE has_completed_onboarding = false;

-- Update existing families that have children to mark onboarding as complete
-- (for families that existed before this migration)
UPDATE family
SET has_completed_onboarding = true
WHERE id IN (
  SELECT DISTINCT family_id 
  FROM children 
  WHERE family_id IS NOT NULL
)
AND (has_completed_onboarding IS NULL OR has_completed_onboarding = false);

-- Grant permissions (if RLS is enabled, this ensures authenticated users can read/update)
-- Note: RLS is currently disabled on family table per setup-family-automation.sql
-- but we'll ensure permissions are set anyway
GRANT SELECT, UPDATE ON family TO authenticated;
