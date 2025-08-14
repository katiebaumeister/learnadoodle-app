-- Add avatar column to children table
-- This adds support for storing child avatars

-- Add avatar column with default value
ALTER TABLE children ADD COLUMN IF NOT EXISTS avatar VARCHAR(20) DEFAULT 'prof1';

-- Update existing children to have a default avatar if they don't have one
UPDATE children SET avatar = 'prof1' WHERE avatar IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN children.avatar IS 'Avatar image filename (prof1-prof10) for the child';

SELECT 'Avatar column added successfully to children table!' as status; 