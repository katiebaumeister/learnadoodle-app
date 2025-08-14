-- Fix children table - add all missing columns
-- This adds support for all the fields the frontend is trying to use

-- Add avatar column
ALTER TABLE children ADD COLUMN IF NOT EXISTS avatar VARCHAR(20) DEFAULT 'prof1';

-- Add learning_style column
ALTER TABLE children ADD COLUMN IF NOT EXISTS learning_style TEXT;

-- Add interests column
ALTER TABLE children ADD COLUMN IF NOT EXISTS interests TEXT;

-- Add standards column
ALTER TABLE children ADD COLUMN IF NOT EXISTS standards TEXT;

-- Add college_bound column
ALTER TABLE children ADD COLUMN IF NOT EXISTS college_bound BOOLEAN DEFAULT false;

-- Update existing children to have default values
UPDATE children SET avatar = 'prof1' WHERE avatar IS NULL;
UPDATE children SET college_bound = false WHERE college_bound IS NULL;

-- Add comments to document the columns
COMMENT ON COLUMN children.avatar IS 'Avatar image filename (prof1-prof10) for the child';
COMMENT ON COLUMN children.learning_style IS 'Child''s preferred learning style (visual, verbal, kinesthetic, etc.)';
COMMENT ON COLUMN children.interests IS 'Child''s interests and hobbies';
COMMENT ON COLUMN children.standards IS 'Learning standards or tests the child is working toward';
COMMENT ON COLUMN children.college_bound IS 'Whether the child is college-bound';

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'children' 
ORDER BY ordinal_position;

SELECT 'Children table updated successfully with all required columns!' as status; 