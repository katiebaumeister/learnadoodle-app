-- Fast lookup of overwrite-safe placeholders by block (block-aware regeneration).
-- Only indexes rows that apply_to_calendar is allowed to update/delete.
CREATE INDEX IF NOT EXISTS idx_events_plan_placeholders_by_block
ON events(academic_year_id, source_block_id)
WHERE is_placeholder = true AND generated_by = 'plan_year';

COMMENT ON INDEX idx_events_plan_placeholders_by_block IS 'Block-aware regen: find placeholders for a block without scanning custom events';
