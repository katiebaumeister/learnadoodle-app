-- Constraint inclusion: does this event count toward required days/hours?
-- Separate from overwrite behavior (is_placeholder + generated_by).
-- Default true; compliance queries filter on counts_toward_plan = true.
ALTER TABLE events
ADD COLUMN IF NOT EXISTS counts_toward_plan boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_events_counts_toward_plan
ON events(counts_toward_plan);

COMMENT ON COLUMN events.counts_toward_plan IS 'If true, event counts toward instructional day/hour requirement (plan compliance). Independent of is_placeholder/generated_by.';
