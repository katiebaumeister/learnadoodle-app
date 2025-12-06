-- Add metadata JSONB column to uploads table for storing syllabus links and other metadata
-- This enables evidence auto-linking to syllabus units

DO $$
BEGIN
  -- Add metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added metadata column to uploads table';
  ELSE
    RAISE NOTICE 'metadata column already exists in uploads table';
  END IF;
END $$;

-- Create index on metadata for faster queries
CREATE INDEX IF NOT EXISTS uploads_metadata_syllabus_idx ON public.uploads USING GIN (metadata jsonb_path_ops);

-- Add comment
COMMENT ON COLUMN public.uploads.metadata IS 'JSONB metadata for storing syllabus links, auto-linking info, and other custom data';

