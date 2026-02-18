-- ============================================================
-- Plan Year: Placeholder event columns and indexes
-- For apply_to_calendar: safe replace and rollback
-- ============================================================

-- Add columns to events (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'is_placeholder') THEN
    ALTER TABLE events ADD COLUMN is_placeholder BOOLEAN DEFAULT false;
    COMMENT ON COLUMN events.is_placeholder IS 'True for system-generated lesson placeholders from Plan Year';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'generated_by') THEN
    ALTER TABLE events ADD COLUMN generated_by TEXT;
    COMMENT ON COLUMN events.generated_by IS 'Source of generation, e.g. plan_year';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'academic_year_id') THEN
    ALTER TABLE events ADD COLUMN academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL;
    COMMENT ON COLUMN events.academic_year_id IS 'Links placeholder to academic year for replace/rollback';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'generation_batch_id') THEN
    ALTER TABLE events ADD COLUMN generation_batch_id UUID;
    COMMENT ON COLUMN events.generation_batch_id IS 'Batch UUID for replace/rollback of placeholders';
  END IF;
END $$;

-- Indexes for apply_to_calendar replace and queries
CREATE INDEX IF NOT EXISTS idx_events_academic_year_placeholder
  ON events(academic_year_id, is_placeholder)
  WHERE academic_year_id IS NOT NULL AND is_placeholder = true;

CREATE INDEX IF NOT EXISTS idx_events_generation_batch_id
  ON events(generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;
