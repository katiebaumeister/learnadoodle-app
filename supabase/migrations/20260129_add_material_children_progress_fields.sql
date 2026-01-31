-- Ensure material_children has progress fields for Books Read filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_children'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE material_children
      ADD COLUMN status TEXT NOT NULL DEFAULT 'planned';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_children'
      AND column_name = 'started_at'
  ) THEN
    ALTER TABLE material_children
      ADD COLUMN started_at DATE NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_children'
      AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE material_children
      ADD COLUMN finished_at DATE NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS material_children_books_read_idx
  ON material_children (family_id, material_id)
  WHERE status = 'completed' OR finished_at IS NOT NULL;
