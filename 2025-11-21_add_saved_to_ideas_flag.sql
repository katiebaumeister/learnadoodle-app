-- Add saved_to_ideas flag to learning_suggestions for Inspire Learning ideas list

ALTER TABLE learning_suggestions
ADD COLUMN IF NOT EXISTS saved_to_ideas BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN learning_suggestions.saved_to_ideas IS 'True if a parent has saved this suggestion to their ideas list';


